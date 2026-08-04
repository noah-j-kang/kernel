import hashlib
import time
import os
import jwt
from fastapi import Request, HTTPException
from backend.database import db

# In-memory Token Bucket rate limiter
rate_limits = {}

from dotenv import load_dotenv
load_dotenv()

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key-for-local-dev")

async def validate_auth_and_rate_limit(request: Request):
    api_key = request.headers.get("X-API-KEY")
    auth_header = request.headers.get("Authorization")
    
    user_id = None
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            # Try new internal JWT
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("sub")
        except:
            # Fallback to supabase RS256 / HS256
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
            except:
                pass
            
    if not user_id and api_key:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        mapped_user_id = db.get_user_for_api_key(key_hash)
        # Using synchronous dictionary get is fine because it's loaded in memory, but I added an async wrapper. Let's just use the dict directly to avoid await
        mapped_user_id = db.api_keys_cache.get(key_hash)
        
        if mapped_user_id:
            user_id = mapped_user_id
        elif api_key.startswith("mm_") or api_key.startswith("nt_") or api_key.startswith("perp_") or api_key.startswith("mom_") or api_key.startswith("fund_") or api_key.startswith("arb_") or api_key == "opt_mm":
            user_id = api_key # Fallback for MVP internal bots
        
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing or Invalid Authentication")
        
    # Rate Limiting (Token Bucket)
    key_hash_user = hashlib.sha256(user_id.encode()).hexdigest()
    
    now = time.time()
    rate_info = rate_limits.get(key_hash_user, {"tokens": 10.0, "last_refill": now})
    
    time_passed = now - rate_info["last_refill"]
    rate_info["tokens"] = min(10.0, rate_info["tokens"] + time_passed * 10.0) # 10 tokens/sec
    
    if rate_info["tokens"] < 1.0:
        rate_limits[key_hash_user] = rate_info
        raise HTTPException(status_code=429, detail="Too Many Requests")
        
    rate_info["tokens"] -= 1.0
    rate_info["last_refill"] = now
    rate_limits[key_hash_user] = rate_info
    
    return user_id
