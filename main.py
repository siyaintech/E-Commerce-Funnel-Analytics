import os
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import date, datetime

from database import get_db, engine
from schemas import (
    FunnelResponse,
    FunnelStep,
    DropoffStep,
    SegmentResponse,
    SegmentFunnel,
    DailyTrendPoint,
    HealthCheckResponse
)

app = FastAPI(
    title="E-commerce Funnel Analysis API",
    description="Backend API for analysing eCommerce user behavior funnels (View -> Cart -> Purchase)",
    version="1.0.0"
)

# Enable CORS for the frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the actual domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to parse dates for SQL injection protection and datetime conversion
def parse_date_filter(d: Optional[date], default_time: str) -> Optional[datetime]:
    if d is None:
        return None
    return datetime.strptime(f"{d} {default_time}", "%Y-%m-%d %H:%M:%S")

@app.get("/health", response_model=HealthCheckResponse, tags=["Diagnostics"])
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint to verify API and database connectivity."""
    db_status = "healthy"
    try:
        # Run a simple query to verify database response
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
    
    return {
        "status": "online",
        "database": db_status
    }

@app.get("/funnel", response_model=FunnelResponse, tags=["Analytics"])
def get_funnel(
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    category_code: Optional[str] = Query(None, description="Filter by category code"),
    db: Session = Depends(get_db)
):
    """
    Computes count and conversion % for each step in the funnel (View -> Cart -> Purchase).
    Conversion and counts are calculated per UNIQUE user_session.
    """
    sql = """
        SELECT 
            COUNT(DISTINCT CASE WHEN event_type = 'view' THEN user_session END) as view_sessions,
            COUNT(DISTINCT CASE WHEN event_type = 'cart' THEN user_session END) as cart_sessions,
            COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_session END) as purchase_sessions
        FROM events
        WHERE 1=1
    """
    params = {}
    
    if start_date:
        sql += " AND event_time >= :start_dt"
        params["start_dt"] = parse_date_filter(start_date, "00:00:00")
    if end_date:
        sql += " AND event_time <= :end_dt"
        params["end_dt"] = parse_date_filter(end_date, "23:59:59")
    if brand:
        sql += " AND brand = :brand"
        params["brand"] = brand
    if category_code:
        sql += " AND category_code = :category_code"
        params["category_code"] = category_code

    try:
        result = db.execute(text(sql), params).fetchone()
        
        view_count = result[0] or 0
        cart_count = result[1] or 0
        purchase_count = result[2] or 0
        
        # Calculate conversion rates relative to the first step (View)
        view_conv = 100.0 if view_count > 0 else 0.0
        cart_conv = round((cart_count / view_count) * 100, 2) if view_count > 0 else 0.0
        purchase_conv = round((purchase_count / view_count) * 100, 2) if view_count > 0 else 0.0
        
        # Calculate step-to-step conversion rates (View->Cart, Cart->Purchase)
        view_step_conv = 100.0 if view_count > 0 else 0.0
        cart_step_conv = cart_conv
        purchase_step_conv = round((purchase_count / cart_count) * 100, 2) if cart_count > 0 else 0.0
        
        steps = [
            FunnelStep(
                step="view",
                display_name="Product Views",
                count=view_count,
                conversion_rate=view_conv,
                step_conversion_rate=view_step_conv
            ),
            FunnelStep(
                step="cart",
                display_name="Add to Cart",
                count=cart_count,
                conversion_rate=cart_conv,
                step_conversion_rate=cart_step_conv
            ),
            FunnelStep(
                step="purchase",
                display_name="Purchases",
                count=purchase_count,
                conversion_rate=purchase_conv,
                step_conversion_rate=purchase_step_conv
            )
        ]
        
        # Total unique sessions is computed as sessions with at least one event in selection
        total_sessions_query = "SELECT COUNT(DISTINCT user_session) FROM events WHERE 1=1"
        if start_date:
            total_sessions_query += " AND event_time >= :start_dt"
        if end_date:
            total_sessions_query += " AND event_time <= :end_dt"
        if brand:
            total_sessions_query += " AND brand = :brand"
        if category_code:
            total_sessions_query += " AND category_code = :category_code"
            
        total_sessions = db.execute(text(total_sessions_query), params).scalar() or 0
        
        return FunnelResponse(steps=steps, total_sessions=total_sessions)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")

@app.get("/funnel/dropoff", response_model=List[DropoffStep], tags=["Analytics"])
def get_dropoff(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    brand: Optional[str] = Query(None),
    category_code: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Returns the user session drop-offs and consecutive drop-off % between funnel steps."""
    funnel = get_funnel(start_date, end_date, brand, category_code, db)
    
    view_count = funnel.steps[0].count
    cart_count = funnel.steps[1].count
    purchase_count = funnel.steps[2].count
    
    # Calculate Drop-offs
    view_to_cart_dropoff_count = view_count - cart_count
    view_to_cart_dropoff_rate = round(100.0 - funnel.steps[1].step_conversion_rate, 2)
    
    cart_to_purchase_dropoff_count = cart_count - purchase_count
    cart_to_purchase_dropoff_rate = round(100.0 - funnel.steps[2].step_conversion_rate, 2)
    
    return [
        DropoffStep(
            stage="View to Cart",
            dropoff_count=max(0, view_to_cart_dropoff_count),
            dropoff_rate=view_to_cart_dropoff_rate
        ),
        DropoffStep(
            stage="Cart to Purchase",
            dropoff_count=max(0, cart_to_purchase_dropoff_count),
            dropoff_rate=cart_to_purchase_dropoff_rate
        )
    ]

@app.get("/funnel/segment", response_model=SegmentResponse, tags=["Analytics"])
def get_segment(
    by: str = Query(..., description="Segment dimension: must be 'brand' or 'category_code'"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns funnel data broken down by the specified segment (brand or category_code).
    Null values are excluded and a sample size note is calculated for statistical significance.
    """
    if by not in ["brand", "category_code"]:
        raise HTTPException(status_code=400, detail="Segment parameter 'by' must be 'brand' or 'category_code'")
        
    column_name = by
    
    # Exclude null values from segment analytics
    sql = f"""
        SELECT 
            {column_name} as segment_val,
            COUNT(DISTINCT CASE WHEN event_type = 'view' THEN user_session END) as view_sessions,
            COUNT(DISTINCT CASE WHEN event_type = 'cart' THEN user_session END) as cart_sessions,
            COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_session END) as purchase_sessions
        FROM events
        WHERE {column_name} IS NOT NULL AND {column_name} != ''
    """
    
    params = {}
    if start_date:
        sql += " AND event_time >= :start_dt"
        params["start_dt"] = parse_date_filter(start_date, "00:00:00")
    if end_date:
        sql += " AND event_time <= :end_dt"
        params["end_dt"] = parse_date_filter(end_date, "23:59:59")
        
    sql += f" GROUP BY {column_name} ORDER BY view_sessions DESC LIMIT 25"
    
    try:
        results = db.execute(text(sql), params).fetchall()
        
        segments = []
        for row in results:
            segment_val = row[0]
            view_count = row[1] or 0
            cart_count = row[2] or 0
            purchase_count = row[3] or 0
            
            # Funnel calculations
            view_conv = 100.0 if view_count > 0 else 0.0
            cart_conv = round((cart_count / view_count) * 100, 2) if view_count > 0 else 0.0
            purchase_conv = round((purchase_count / view_count) * 100, 2) if view_count > 0 else 0.0
            
            view_step_conv = 100.0 if view_count > 0 else 0.0
            cart_step_conv = cart_conv
            purchase_step_conv = round((purchase_count / cart_count) * 100, 2) if cart_count > 0 else 0.0
            
            steps = [
                FunnelStep(
                    step="view",
                    display_name="Product Views",
                    count=view_count,
                    conversion_rate=view_conv,
                    step_conversion_rate=view_step_conv
                ),
                FunnelStep(
                    step="cart",
                    display_name="Add to Cart",
                    count=cart_count,
                    conversion_rate=cart_conv,
                    step_conversion_rate=cart_step_conv
                ),
                FunnelStep(
                    step="purchase",
                    display_name="Purchases",
                    count=purchase_count,
                    conversion_rate=purchase_conv,
                    step_conversion_rate=purchase_step_conv
                )
            ]
            
            # Determine sample size significance (Total sessions for segment is view count)
            sample_size = view_count
            if sample_size >= 150:
                note = "Statistically Significant (High Volume)"
            elif sample_size >= 50:
                note = "Moderate Volume (Reliable)"
            else:
                note = "Caution: Low Volume (Unreliable Conversion Rates)"
                
            segments.append(
                SegmentFunnel(
                    segment_value=segment_val,
                    steps=steps,
                    sample_size=sample_size,
                    sample_size_note=note
                )
            )
            
        return SegmentResponse(by=by, segments=segments)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")

@app.get("/funnel/trend", response_model=List[DailyTrendPoint], tags=["Analytics"])
def get_trend(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    brand: Optional[str] = Query(None),
    category_code: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Returns the daily funnel counts and conversion rates over a date range."""
    sql = """
        SELECT 
            DATE(event_time) as event_date,
            COUNT(DISTINCT CASE WHEN event_type = 'view' THEN user_session END) as view_sessions,
            COUNT(DISTINCT CASE WHEN event_type = 'cart' THEN user_session END) as cart_sessions,
            COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_session END) as purchase_sessions
        FROM events
        WHERE 1=1
    """
    params = {}
    
    if start_date:
        sql += " AND event_time >= :start_dt"
        params["start_dt"] = parse_date_filter(start_date, "00:00:00")
    if end_date:
        sql += " AND event_time <= :end_dt"
        params["end_dt"] = parse_date_filter(end_date, "23:59:59")
    if brand:
        sql += " AND brand = :brand"
        params["brand"] = brand
    if category_code:
        sql += " AND category_code = :category_code"
        params["category_code"] = category_code
        
    sql += " GROUP BY DATE(event_time) ORDER BY event_date ASC"
    
    try:
        results = db.execute(text(sql), params).fetchall()
        
        trend = []
        for row in results:
            d_str = str(row[0])
            views = row[1] or 0
            carts = row[2] or 0
            purchases = row[3] or 0
            
            cart_rate = round((carts / views) * 100, 2) if views > 0 else 0.0
            purchase_rate = round((purchases / views) * 100, 2) if views > 0 else 0.0
            
            trend.append(
                DailyTrendPoint(
                    date=d_str,
                    view_count=views,
                    cart_count=carts,
                    purchase_count=purchases,
                    cart_conversion_rate=cart_rate,
                    purchase_conversion_rate=purchase_rate
                )
            )
        return trend
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")

@app.get("/funnel/filters", tags=["Meta"])
def get_filters(db: Session = Depends(get_db)):
    """Exposes all active brands and category codes to populate dashboard dropdown filters."""
    try:
        brands_res = db.execute(
            text("SELECT DISTINCT brand FROM events WHERE brand IS NOT NULL AND brand != '' ORDER BY brand ASC")
        ).fetchall()
        categories_res = db.execute(
            text("SELECT DISTINCT category_code FROM events WHERE category_code IS NOT NULL AND category_code != '' ORDER BY category_code ASC")
        ).fetchall()
        
        return {
            "brands": [row[0] for row in brands_res],
            "category_codes": [row[0] for row in categories_res]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")
