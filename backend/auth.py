import hashlib
import time
from fastapi import Request, HTTPException
from backend.database import db

# In-memory Token Bucket rate limiter (simple per-key dict)
# { key_hash: {"tokens": 10.0, "last_refill": 1642839281.0} }
rate_limits = {}

async def validate_auth_and_rate_limit(request: Request):
    api_key = request.headers.get("X-API-KEY")
    if not api_key:
        # In a real system we reject here. 
        # For the MVP bots to easily test the logic if they bypass auth, we'll allow a fallback.
        # But we'll mandate it for the token bucket logic.
        raise HTTPException(status_code=401, detail="Missing X-API-KEY header")
        
    # We will use the raw key as the user_id for simplicity in this simulated MVP
    # In production, we'd hash it and look up the user_id
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    
    # Rate Limiting (Token Bucket)
    now = time.time()
    rate_info = rate_limits.get(key_hash, {"tokens": 10.0, "last_refill": now})
    
    time_passed = now - rate_info["last_refill"]
    rate_info["tokens"] = min(10.0, rate_info["tokens"] + time_passed * 10.0) # 10 tokens/sec
    
    if rate_info["tokens"] < 1.0:
        rate_limits[key_hash] = rate_info
        raise HTTPException(status_code=429, detail="Too Many Requests")
        
    rate_info["tokens"] -= 1.0
    rate_info["last_refill"] = now
    rate_limits[key_hash] = rate_info
    
    return api_key # Returning raw api_key as user_id for the MVP engine
