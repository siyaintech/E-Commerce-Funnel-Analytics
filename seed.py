import os
import sys
import uuid
import random
import pandas as pd
from datetime import datetime, timedelta
from sqlalchemy import text
from database import engine

RAW_CSV_PATH = os.getenv("RAW_CSV_PATH", "ecommerce_raw.csv")
TABLE_NAME = "events"

def generate_mock_dataset(filepath: str, num_sessions: int = 5000):
    """Generates a realistic raw eCommerce event history dataset for demonstration."""
    print(f"Generating mock raw eCommerce dataset with {num_sessions} sessions...")
    
    brands = ["Samsung", "Apple", "Xiaomi", "Huawei", "Sony", "Asus", "Lenovo", "LG", None, None]
    categories = [
        ("electronics.smartphone", 100, 1200),
        ("electronics.audio", 20, 300),
        ("computers.notebook", 400, 2500),
        ("computers.peripherals", 10, 150),
        ("appliances.kitchen.refrigerators", 300, 1800),
        (None, 50, 500)  # Category can be null
    ]
    
    start_date = datetime.now() - timedelta(days=30)
    data = []
    
    # Generate user sessions
    for _ in range(num_sessions):
        user_id = random.randint(1000000, 9999999)
        session_id = str(uuid.uuid4())
        
        # Decide if this session has a null session id (for data cleaning verification)
        if random.random() < 0.02:
            session_id = ""
            
        brand = random.choice(brands)
        category_code, min_price, max_price = random.choice(categories)
        category_id = random.randint(100000000, 999999999) if category_code else None
        product_id = random.randint(200000, 800000)
        price = round(random.uniform(min_price, max_price), 2) if min_price else round(random.uniform(5, 500), 2)
        
        # Session start time
        session_start = start_date + timedelta(
            days=random.uniform(0, 30),
            hours=random.uniform(0, 24),
            minutes=random.uniform(0, 60)
        )
        
        # Funnel decisions
        # All sessions start with a 'view'
        view_time = session_start
        data.append({
            "event_time": view_time.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "event_type": "view",
            "product_id": product_id,
            "category_id": category_id,
            "category_code": category_code,
            "brand": brand,
            "price": price,
            "user_id": user_id,
            "user_session": session_id
        })
        
        # 35% add to cart
        if session_id and random.random() < 0.35:
            cart_time = view_time + timedelta(seconds=random.randint(10, 300))
            data.append({
                "event_time": cart_time.strftime("%Y-%m-%d %H:%M:%S UTC"),
                "event_type": "cart",
                "product_id": product_id,
                "category_id": category_id,
                "category_code": category_code,
                "brand": brand,
                "price": price,
                "user_id": user_id,
                "user_session": session_id
            })
            
            # 40% of cart additions purchase
            if random.random() < 0.40:
                purchase_time = cart_time + timedelta(seconds=random.randint(20, 600))
                data.append({
                    "event_time": purchase_time.strftime("%Y-%m-%d %H:%M:%S UTC"),
                    "event_type": "purchase",
                    "product_id": product_id,
                    "category_id": category_id,
                    "category_code": category_code,
                    "brand": brand,
                    "price": price,
                    "user_id": user_id,
                    "user_session": session_id
                })
                
    # Add some exact duplicate rows for testing cleaning logic (approx 5% duplicates)
    num_duplicates = int(len(data) * 0.05)
    for _ in range(num_duplicates):
        data.append(random.choice(data).copy())
        
    df = pd.DataFrame(data)
    # Shuffle
    df = df.sample(frac=1).reset_index(drop=True)
    df.to_csv(filepath, index=False)
    print(f"Mock raw CSV saved with {len(df)} rows to: {filepath}")


def clean_and_load():
    """Reads raw CSV, applies cleaning logic, and loads into PostgreSQL."""
    if not os.path.exists(RAW_CSV_PATH):
        print(f"Raw CSV not found at {RAW_CSV_PATH}.")
        generate_mock_dataset(RAW_CSV_PATH, num_sessions=8000)
        
    print(f"Reading raw data from: {RAW_CSV_PATH}")
    df = pd.read_csv(RAW_CSV_PATH)
    initial_rows = len(df)
    print(f"Initial row count: {initial_rows}")
    
    # 1. Drop exact duplicate rows
    df = df.drop_duplicates()
    rows_after_dup = len(df)
    print(f"Dropped {initial_rows - rows_after_dup} exact duplicate rows.")
    
    # 2. Drop rows with null or empty user_session
    df = df.dropna(subset=["user_session"])
    df = df[df["user_session"].astype(str).str.strip() != ""]
    rows_after_session = len(df)
    print(f"Dropped {rows_after_dup - rows_after_session} rows with null/empty user_session.")
    
    # Validate UUID format for user_session to prevent PostgreSQL loading errors
    def is_valid_uuid(val):
        try:
            uuid.UUID(str(val))
            return True
        except ValueError:
            return False
            
    df = df[df["user_session"].apply(is_valid_uuid)]
    rows_after_uuid_check = len(df)
    print(f"Dropped {rows_after_session - rows_after_uuid_check} rows with invalid UUID formats.")
    
    # 3. Keep nulls in category_code and brand as-is (done implicitly as pandas keeps NaN values)
    # Convert event_time string to proper datetime format
    df["event_time"] = pd.to_datetime(df["event_time"])
    
    print(f"Final clean row count to load: {len(df)}")
    
    # Connect and verify/create table structure
    print("Connecting to PostgreSQL and setting up database structure...")
    schema_path = "../db/schema.sql"
    if not os.path.exists(schema_path):
        schema_path = "db/schema.sql"
        if not os.path.exists(schema_path):
            schema_path = "/app/db/schema.sql"
            
    with engine.connect() as conn:
        # Run schema script to ensure table and indexes are created
        if os.path.exists(schema_path):
            print(f"Applying schema script: {schema_path}")
            with open(schema_path, "r") as f:
                schema_sql = f.read()
            # Split sql by semicolon to run each statement separately
            for statement in schema_sql.split(";"):
                stmt = statement.strip()
                if stmt:
                    conn.execute(text(stmt))
            conn.commit()
            print("Database table and indexes configured successfully.")
        else:
            print("Warning: schema.sql not found! Table will be auto-created by pandas if missing.")
            
        # Check if table already has data to prevent duplicate seedings
        try:
            res = conn.execute(text(f"SELECT COUNT(*) FROM {TABLE_NAME}"))
            count = res.scalar()
            if count > 0:
                print(f"Database already contains {count} events. Skipping seed load to avoid duplication.")
                return
        except Exception as e:
            # Table might not exist yet
            pass

    # Load cleaned data into PostgreSQL
    print(f"Loading {len(df)} rows into '{TABLE_NAME}' table in database...")
    df.to_sql(TABLE_NAME, engine, if_exists="append", index=False, chunksize=5000)
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    clean_and_load()
