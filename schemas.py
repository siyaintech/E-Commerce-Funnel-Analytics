from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date

class FunnelStep(BaseModel):
    step: str = Field(..., description="Stage name (view, cart, purchase)")
    display_name: str = Field(..., description="User-friendly name of the step")
    count: int = Field(..., description="Number of unique sessions reaching this step")
    conversion_rate: float = Field(..., description="Conversion rate relative to the first step (View)")
    step_conversion_rate: float = Field(..., description="Conversion rate relative to the previous step")

class FunnelResponse(BaseModel):
    steps: List[FunnelStep]
    total_sessions: int

class DropoffStep(BaseModel):
    stage: str = Field(..., description="Consecutive steps (e.g., 'View to Cart')")
    dropoff_count: int = Field(..., description="Number of sessions that dropped off")
    dropoff_rate: float = Field(..., description="Drop-off percentage between consecutive steps")

class SegmentFunnel(BaseModel):
    segment_value: str = Field(..., description="Value of the segment (e.g., brand name)")
    steps: List[FunnelStep]
    sample_size: int = Field(..., description="Total sessions for this segment (used as sample size)")
    sample_size_note: str = Field(..., description="Note on statistical significance of the sample size")

class SegmentResponse(BaseModel):
    by: str = Field(..., description="Dimension segmented by (brand or category_code)")
    segments: List[SegmentFunnel]

class DailyTrendPoint(BaseModel):
    date: str = Field(..., description="Date (YYYY-MM-DD)")
    view_count: int
    cart_count: int
    purchase_count: int
    cart_conversion_rate: float = Field(..., description="Cart sessions / View sessions %")
    purchase_conversion_rate: float = Field(..., description="Purchase sessions / View sessions %")

class HealthCheckResponse(BaseModel):
    status: str
    database: str
