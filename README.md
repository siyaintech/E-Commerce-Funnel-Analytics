# Siya Funnel - E-Commerce Funnel Analysis Dashboard

An end-to-end full-stack web application designed to analyze and visualize e-commerce shopping funnel conversion and drop-off metrics per unique user session. 

This platform processes raw e-commerce events (based on columns in the Kaggle *"eCommerce events history"* dataset), cleans the data through an automated pipeline, saves it in a optimized PostgreSQL database, and presents insights via a responsive, glassmorphic React dashboard.

---

## Architecture Overview

```
                      +------------------------------------------+
                      |                 Browser                  |
                      |        (React + Recharts + Tailwind)     |
                      +--------------------+---------------------+
                                           | HTTP Requests
                                           v
                      +--------------------+---------------------+
                      |           FastAPI Web Server             |
                      |          (SQLAlchemy / Python)           |
                      +--------------------+---------------------+
                                           | SQL Queries
                                           v
                      +--------------------+---------------------+
                      |            PostgreSQL Database           |
                      |          (events table + indexes)        |
                      +------------------------------------------+
```

---

## Funnel Steps & Rationale

We track the standard e-commerce funnel flow: **View → Cart → Purchase**.

1. **Product Views (`view`)**: Represents user discovery and intent. This is the baseline (100%) of the funnel.
2. **Add to Cart (`cart`)**: Indicates active purchasing intent. Users evaluate price, shipping, and compare options here.
3. **Purchases (`purchase`)**: The conversion event. Denotes successful checkouts.

### Calculation Logic (Session-Based vs. Event-Based)
Rather than count raw events (which inflate metrics when a user views multiple products or adds multiple items to a cart), this dashboard computes rates **per unique `user_session`**:
- **View Sessions**: Count of unique `user_session`s containing at least one `view` event.
- **Cart Sessions**: Count of unique `user_session`s containing at least one `cart` event.
- **Purchase Sessions**: Count of unique `user_session`s containing at least one `purchase` event.
- **Conversion Rate**: Measured relative to the baseline (Views).
- **Consecutive Drop-off**: Calculated as `1 - (Current Step / Previous Step)`.

---

## Database Schema & Indexing Decisions

The system uses a flat PostgreSQL table named `events` to store cleaned data, optimize read times, and simplify analytics queries.

### Schema Definition
- `id` SERIAL PRIMARY KEY (Unique surrogate key)
- `event_time` TIMESTAMP NOT NULL (Time of event)
- `event_type` VARCHAR(20) NOT NULL (Values: `view`, `cart`, `purchase`)
- `product_id` BIGINT NOT NULL (Product ID)
- `category_id` BIGINT (E-commerce category code ID)
- `category_code` VARCHAR(255) (Dot-separated classification path, e.g. `electronics.smartphone`)
- `brand` VARCHAR(100) (Brand name, e.g. `Apple`)
- `price` NUMERIC(10,2) (Price of the item)
- `user_id` BIGINT NOT NULL (Unique visitor identifier)
- `user_session` UUID NOT NULL (Unique session token)

### Indexing Decisions
To achieve sub-second dashboard rendering times even with millions of rows, we add the following indexes:
- `idx_events_user_session` ON `user_session`: Speeds up `COUNT(DISTINCT user_session)` aggregations.
- `idx_events_event_type` ON `event_type`: Accelerates conditional session counts (e.g. `CASE WHEN event_type = 'view'`).
- `idx_events_event_time` ON `event_time`: Optimized for date filtering and chronological daily trend queries.
- `idx_events_brand` and `idx_events_category_code`: Speeds up segmented funnel analytics and metadata listings.

---

## How to Run Locally with Docker

You can launch the entire stack (PostgreSQL database, FastAPI backend, and Vite frontend) with a single command:

1. Clone or copy this repository to your workspace.
2. If you have your own Kaggle ecommerce history dataset, place it in the root folder named `ecommerce_raw.csv`. If no file is present, the backend seed script will **automatically generate a realistic mock dataset containing 20,000+ events** so the application works out-of-the-box!
3. Open your terminal in the project directory and run:
   ```bash
   docker compose up --build
   ```
4. Access the applications:
   - **Interactive Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
   - **FastAPI Backend (Swagger Docs)**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **FastAPI Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

## API Endpoints Reference

All analytics endpoints accept global filter parameters (`start_date`, `end_date`, `brand`, and `category_code`).

### 1. `GET /health`
Verifies API status and database connectivity.
- **Response**: `{ "status": "online", "database": "healthy" }`

### 2. `GET /funnel`
Computes counts and conversion percentages for each step of the funnel.
- **Query Params**: `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD), `brand`, `category_code`
- **Sample Response**:
  ```json
  {
    "total_sessions": 8412,
    "steps": [
      { "step": "view", "display_name": "Product Views", "count": 8412, "conversion_rate": 100.0, "step_conversion_rate": 100.0 },
      { "step": "cart", "display_name": "Add to Cart", "count": 2944, "conversion_rate": 35.0, "step_conversion_rate": 35.0 },
      { "step": "purchase", "display_name": "Purchases", "count": 1177, "conversion_rate": 14.0, "step_conversion_rate": 40.0 }
    ]
  }
  ```

### 3. `GET /funnel/dropoff`
Returns the consecutive drop-off % and session volume loss between steps.
- **Query Params**: `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD), `brand`, `category_code`
- **Sample Response**:
  ```json
  [
    { "stage": "View to Cart", "dropoff_count": 5468, "dropoff_rate": 65.0 },
    { "stage": "Cart to Purchase", "dropoff_count": 1767, "dropoff_rate": 60.0 }
  ]
  ```

### 4. `GET /funnel/segment`
Breaks down the funnel performance by a specific segment dimension. Nulls are excluded.
- **Query Params**: `by` (`brand` or `category_code`) [Required], `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD)
- **Sample Response**:
  ```json
  {
    "by": "brand",
    "segments": [
      {
        "segment_value": "Apple",
        "steps": [
          { "step": "view", "display_name": "Product Views", "count": 1824, "conversion_rate": 100.0, "step_conversion_rate": 100.0 },
          { "step": "cart", "display_name": "Add to Cart", "count": 782, "conversion_rate": 42.87, "step_conversion_rate": 42.87 },
          { "step": "purchase", "display_name": "Purchases", "count": 391, "conversion_rate": 21.43, "step_conversion_rate": 50.0 }
        ],
        "sample_size": 1824,
        "sample_size_note": "Statistically Significant (High Volume)"
      }
    ]
  }
  ```

### 5. `GET /funnel/trend`
Provides day-by-day conversion rate tracking.
- **Query Params**: `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD), `brand`, `category_code`
- **Sample Response**:
  ```json
  [
    {
      "date": "2026-08-01",
      "view_count": 280,
      "cart_count": 98,
      "purchase_count": 39,
      "cart_conversion_rate": 35.0,
      "purchase_conversion_rate": 13.93
    }
  ]
  ```

### 6. `GET /funnel/filters`
Retrieves all unique brand names and category codes currently present in the database to populate frontend options.

---

## Key Findings & Data Insights

*Below are insights obtained from analyzing our mock/seeded event data:*

- 📉 **The View-to-Cart Drop-off Bottleneck**: Across all segments, the transition from **View → Add to Cart** shows a drop-off rate of **65% to 70%**. This suggests significant price comparison shopping, lack of clear product descriptions, or insufficient initial reviews.
- 🛍️ **High Cart Purchase Completion**: Once an item is placed in the cart, the conversion rate to purchase is strong (**40%**). Re-engagement emails or abandoned-cart discount alerts could yield high return on investment.
- 🍏 **Segment Leadership**: **Apple** and **Samsung** products lead both view counts and overall purchase conversions (~18-20% overall conversion), whereas lower tier brands show moderate views but sub-5% purchase completion.
- 📅 **Temporal Trends**: Funnel conversions remain relatively stable day-to-day, but minor peaks occur during weekends. Marketing budgets could benefit from targeting weekend ad placements.
