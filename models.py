from sqlalchemy import Column, Integer, String, BigInteger, Numeric, DateTime
from sqlalchemy.dialects.postgresql import UUID
from .database import Base

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    event_time = Column(DateTime, nullable=False, index=True)
    event_type = Column(String(20), nullable=False, index=True)
    product_id = Column(BigInteger, nullable=False)
    category_id = Column(BigInteger, nullable=True)
    category_code = Column(String(255), nullable=True, index=True)
    brand = Column(String(100), nullable=True, index=True)
    price = Column(Numeric(10, 2), nullable=True)
    user_id = Column(BigInteger, nullable=False)
    user_session = Column(UUID(as_uuid=True), nullable=False, index=True)
