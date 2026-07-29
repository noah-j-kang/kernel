from pydantic import BaseModel
from typing import Optional

class OrderRequest(BaseModel):
    instrument_id: str = "KERNEL-USD-SPOT"
    side: str
    type: str
    price: Optional[float] = None
    quantity: float
