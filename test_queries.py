import sqlite3
import json
from datetime import datetime

def test_funnel_analytics():
    print("=== Testing Funnel Analytics Queries via SQLite ===")
    
    # 1. Setup in-memory database
    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()
    
    # Create the events table mimicking our schema
    cursor.execute("""
    CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_time TEXT NOT NULL,
        event_type TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        category_id INTEGER,
        category_code TEXT,
        brand TEXT,
        price REAL,
        user_id INTEGER NOT NULL,
        user_session TEXT NOT NULL
    );
    """)
    
    # Define realistic test events
    # We will simulate several sessions:
    # Session A: View (Day 1) -> Cart (Day 1) -> Purchase (Day 1) [Success]
    # Session B: View (Day 1) -> Cart (Day 1) [Drop-off at purchase]
    # Session C: View (Day 1) [Drop-off at cart]
    # Session D: View (Day 2) -> Cart (Day 2) -> Purchase (Day 2) [Success]
    # Session E: View (Day 2) -> Purchase (Day 2) [View -> Purchase direct, no cart]
    # Session F: Cart (Day 2) [No view, check behavior]
    # duplicate row for Session A to test duplicate tolerance (handled in cleaner, but query should distinct anyways)
    
    test_events = [
        # Session A: Apple smartphone
        ("2026-08-01 10:00:00", "view", 101, 1001, "electronics.smartphone", "Apple", 999.00, 10001, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        ("2026-08-01 10:02:00", "cart", 101, 1001, "electronics.smartphone", "Apple", 999.00, 10001, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        ("2026-08-01 10:02:00", "cart", 101, 1001, "electronics.smartphone", "Apple", 999.00, 10001, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), # duplicate raw row
        ("2026-08-01 10:05:00", "purchase", 101, 1001, "electronics.smartphone", "Apple", 999.00, 10001, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        
        # Session B: Samsung audio
        ("2026-08-01 11:00:00", "view", 102, 1002, "electronics.audio", "Samsung", 150.00, 10002, "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"),
        ("2026-08-01 11:15:00", "cart", 102, 1002, "electronics.audio", "Samsung", 150.00, 10002, "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"),
        
        # Session C: Xiaomi smartphone
        ("2026-08-01 12:00:00", "view", 103, 1001, "electronics.smartphone", "Xiaomi", 300.00, 10003, "cccccccc-dddd-eeee-ffff-000000000000"),
        
        # Session D: Samsung smartphone
        ("2026-08-02 09:00:00", "view", 104, 1001, "electronics.smartphone", "Samsung", 800.00, 10004, "dddddddd-eeee-ffff-0000-111111111111"),
        ("2026-08-02 09:10:00", "cart", 104, 1001, "electronics.smartphone", "Samsung", 800.00, 10004, "dddddddd-eeee-ffff-0000-111111111111"),
        ("2026-08-02 09:15:00", "purchase", 104, 1001, "electronics.smartphone", "Samsung", 800.00, 10004, "dddddddd-eeee-ffff-0000-111111111111"),
        
        # Session E: Apple smartphone (view and purchase, no cart)
        ("2026-08-02 14:00:00", "view", 101, 1001, "electronics.smartphone", "Apple", 999.00, 10005, "eeeeeeee-ffff-0000-1111-222222222222"),
        ("2026-08-02 14:30:00", "purchase", 101, 1001, "electronics.smartphone", "Apple", 999.00, 10005, "eeeeeeee-ffff-0000-1111-222222222222"),
        
        # Session F: Unknown brand laptop (cart only, no view)
        ("2026-08-02 16:00:00", "cart", 105, 1003, "computers.notebook", None, 1200.00, 10006, "ffffffff-0000-1111-2222-333333333333"),
    ]
    
    cursor.executemany("""
    INSERT INTO events (event_time, event_type, product_id, category_id, category_code, brand, price, user_id, user_session)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, test_events)
    conn.commit()
    print("Mock database populated successfully.\n")

    # 2. Test funnel counts and rates query
    # (Notice how we distinct on user_session to get session-based funnel stats)
    funnel_sql = """
    SELECT 
        COUNT(DISTINCT CASE WHEN event_type = 'view' THEN user_session END) as view_sessions,
        COUNT(DISTINCT CASE WHEN event_type = 'cart' THEN user_session END) as cart_sessions,
        COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_session END) as purchase_sessions
    FROM events;
    """
    cursor.execute(funnel_sql)
    view_s, cart_s, purchase_s = cursor.fetchone()
    
    # Calculate conversion metrics
    view_conv = 100.0
    cart_conv = (cart_s / view_s) * 100 if view_s > 0 else 0
    purchase_conv = (purchase_s / view_s) * 100 if view_s > 0 else 0
    
    print("--- 1. Funnel Results (Sessions) ---")
    print(f"Product Views: {view_s} ({view_conv:.2f}%)")
    print(f"Add to Carts:  {cart_s} ({cart_conv:.2f}%)")
    print(f"Purchases:     {purchase_s} ({purchase_conv:.2f}%)")
    print()
    
    # 3. Test drop-off counts and rates
    print("--- 2. Consecutive Drop-offs ---")
    view_to_cart_drop = view_s - cart_s
    view_to_cart_drop_pct = 100.0 - cart_conv
    
    cart_to_purchase_drop = cart_s - purchase_s
    cart_step_conv = (purchase_s / cart_s) * 100 if cart_s > 0 else 0
    cart_to_purchase_drop_pct = 100.0 - cart_step_conv
    
    print(f"View to Cart drop-off: {view_to_cart_drop} sessions ({view_to_cart_drop_pct:.2f}%)")
    print(f"Cart to Purchase drop-off: {cart_to_purchase_drop} sessions ({cart_to_purchase_drop_pct:.2f}%)")
    print()
    
    # 4. Test segment counts grouped by brand (excluding nulls)
    print("--- 3. Segments by Brand ---")
    segment_sql = """
    SELECT 
        brand,
        COUNT(DISTINCT CASE WHEN event_type = 'view' THEN user_session END) as view_sessions,
        COUNT(DISTINCT CASE WHEN event_type = 'cart' THEN user_session END) as cart_sessions,
        COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_session END) as purchase_sessions
    FROM events
    WHERE brand IS NOT NULL AND brand != ''
    GROUP BY brand
    ORDER BY view_sessions DESC;
    """
    cursor.execute(segment_sql)
    for row in cursor.fetchall():
        brand, v, c, p = row
        v_c = (c / v) * 100 if v > 0 else 0
        p_c = (p / v) * 100 if v > 0 else 0
        print(f"Brand: {brand:<10} | Views: {v} | Carts: {c} ({v_c:.1f}%) | Purchases: {p} ({p_c:.1f}%)")
    print()
    
    # 5. Test trend counts grouped by Date (using strftime to emulate DATE() in Postgres)
    print("--- 4. Daily Trends ---")
    trend_sql = """
    SELECT 
        strftime('%Y-%m-%d', event_time) as event_date,
        COUNT(DISTINCT CASE WHEN event_type = 'view' THEN user_session END) as view_sessions,
        COUNT(DISTINCT CASE WHEN event_type = 'cart' THEN user_session END) as cart_sessions,
        COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_session END) as purchase_sessions
    FROM events
    GROUP BY event_date
    ORDER BY event_date ASC;
    """
    cursor.execute(trend_sql)
    for row in cursor.fetchall():
        dt, v, c, p = row
        v_c = (c / v) * 100 if v > 0 else 0
        p_c = (p / v) * 100 if v > 0 else 0
        print(f"Date: {dt} | Views: {v} | Cart Rate: {v_c:.1f}% | Purchase Rate (Overall): {p_c:.1f}%")
    print()
    
    conn.close()

if __name__ == "__main__":
    test_funnel_analytics()
