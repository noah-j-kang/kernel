from pydantic import BaseModel
from typing import Optional

class OrderRequest(BaseModel):
    side: str
    type: str
    price: Optional[float] = None
    quantity: float
