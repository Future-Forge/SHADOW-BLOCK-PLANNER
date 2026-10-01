import os
import sys
import logging
from pathlib import Path
import psycopg2
from psycopg2.extras import execute_values
import pandas as pd
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("seed_db")

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "shadow_blockplanner")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ShadowPL")

SCHEMA_FILE = BASE_DIR / "database" / "schema.sql"
DATA_DIR = BASE_DIR / "data" / "processed_ir"

TABLE_CSV_MAPPING = [
    {
        "table": "tms_track_defects",
        "csv_file": DATA_DIR / "TMS_Track_Defects.csv",
        "columns": [
            "defect_id", "gq_corridor", "railway_zone", "block_section",
            "track_km", "defect_type", "urgency_level", "ambient_temp_c",
            "required_block_hours", "logged_timestamp"
        ]
    },
    {
        "table": "smms_signal_defects",
        "csv_file": DATA_DIR / "SMMS_Signal_Defects.csv",
        "columns": [
            "defect_id", "gq_corridor", "station_code", "asset_type",
            "failure_mode", "urgency_level", "required_block_hours",
            "logged_timestamp"
        ]
    },
    {
        "table": "tdms_traction_defects",
        "csv_file": DATA_DIR / "TDMS_Traction_Defects.csv",
        "columns": [
            "defect_id", "gq_corridor", "ohe_sector_id", "defect_type",
            "urgency_level", "required_block_hours", "logged_timestamp"
        ]
    },
    {
        "table": "coa_train_timetable",
        "csv_file": DATA_DIR / "COA_Train_Timetable.csv",
        "columns": [
            "slot_id", "gq_corridor", "block_section", "train_number",
            "train_type", "scheduled_entry", "scheduled_exit", "natural_gap_minutes"
        ]
    }
]

def get_connection():
    """Establish connection to the PostgreSQL database."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

def execute_schema(conn):
    """Execute schema.sql to create/recreate required tables."""
    logger.info(f"Applying schema from: {SCHEMA_FILE}")
    if not SCHEMA_FILE.exists():
        raise FileNotFoundError(f"Schema file not found at {SCHEMA_FILE}")

    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    with conn.cursor() as cur:
        cur.execute(schema_sql)
    conn.commit()
    logger.info("Schema applied successfully.")

def bulk_insert_csv(conn, table_name: str, csv_path: Path, columns: list):
    """Read CSV and bulk insert data into the designated PostgreSQL table."""
    logger.info(f"Ingesting {csv_path.name} into table '{table_name}'...")
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found at {csv_path}")

    df = pd.read_csv(csv_path)
    # Ensure column alignment
    df = df[columns]

    # Convert to list of tuples and handle NaNs if any
    records = [tuple(x) for x in df.to_numpy()]

    cols_str = ", ".join(columns)
    insert_query = f"INSERT INTO {table_name} ({cols_str}) VALUES %s ON CONFLICT DO NOTHING"

    with conn.cursor() as cur:
        execute_values(cur, insert_query, records, page_size=1000)
    conn.commit()

    # Verify count
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table_name}")
        row_count = cur.fetchone()[0]
    logger.info(f"Successfully seeded '{table_name}'. Total rows in DB: {row_count}")

def seed_database():
    """Main execution function to seed the PostgreSQL database."""
    logger.info("Starting database initialization and seeding process...")
    try:
        conn = get_connection()
        logger.info(f"Connected to PostgreSQL at {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}.")
        
        execute_schema(conn)

        for mapping in TABLE_CSV_MAPPING:
            bulk_insert_csv(
                conn,
                table_name=mapping["table"],
                csv_path=mapping["csv_file"],
                columns=mapping["columns"]
            )

        conn.close()
        logger.info("Database seeding completed successfully.")
        return True
    except Exception as e:
        logger.error(f"Error during database seeding: {e}", exc_info=True)
        raise

if __name__ == "__main__":
    seed_database()
