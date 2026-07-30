import hashlib
import time
import os
import jwt
from fastapi import Request, HTTPException
from backend.database import db

# In-memory Token Bucket rate limiter (simple per-key dict)
# { key_hash: {"tokens": 10.0, "last_refill": 1642839281.0} }
rate_limits = {}

from dotenv import load_dotenv
load_dotenv()

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

async def validate_auth_and_rate_limit(request: Request):
    api_key = request.headers.get("X-API-KEY")
    auth_header = request.headers.get("Authorization")
    
    user_id = None
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get("alg")
            
            if alg == "RS256":
                supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
                if not supabase_url:
                    raise Exception("SUPABASE_URL not set in .env for RS256 verification")
                jwks_client = jwt.PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json")
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                secret_or_key = signing_key.key
            else:
                secret_or_key = SUPABASE_JWT_SECRET
                
            payload = jwt.decode(
                token, 
                secret_or_key, 
                algorithms=["HS256", "RS256"], 
                audience="authenticated"
            )
            user_id = payload.get("sub")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
            
    if not user_id and api_key:
        user_id = api_key # Fallback for MVP bots
        
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing Authentication")
        
    # Rate Limiting (Token Bucket)
    key_hash = hashlib.sha256(user_id.encode()).hexdigest()
    
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
