from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from passlib.context import CryptContext
import jwt
import os
import secrets
import hashlib
import time
import uuid
from backend.database import db

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key-for-local-dev")

class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class CreateKeyRequest(BaseModel):
    name: str

# In-memory fallbacks for local dev without Postgres
MOCK_USERS = {} # id -> user dict
MOCK_KEYS = {} # key_hash -> key info
MOCK_ID_COUNTER = 1

@router.post("/register")
async def register(req: RegisterRequest):
    global MOCK_ID_COUNTER
    pwd_hash = pwd_context.hash(req.password)
    
    if not db.pool:
        # IN-MEMORY MOCK
        for u in MOCK_USERS.values():
            if u["email"] == req.email:
                raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        MOCK_USERS[user_id] = {"id": user_id, "email": req.email, "password_hash": pwd_hash}
        from backend.main import engine
        engine.update_wallet(user_id, 100000.0, 0.0)
        return {"status": "success", "user_id": user_id}
    
    async with db.pool.acquire() as conn:
        try:
            # Check if exists
            existing = await conn.fetchval("SELECT id FROM users WHERE email = $1", req.email)
            if existing:
                raise HTTPException(status_code=400, detail="Email already registered")
                
            user_id = await conn.fetchval(
                "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
                req.email, pwd_hash
            )
            # Create wallet
            await conn.execute(
                "INSERT INTO wallets (user_id, usd_balance, cookie_balance) VALUES ($1, 100000.00, 0.00)",
                user_id
            )
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            raise HTTPException(status_code=500, detail=str(e))
            
    return {"status": "success", "user_id": str(user_id)}

@router.post("/login")
async def login(req: LoginRequest):
    if not db.pool:
        # IN-MEMORY MOCK
        user = None
        for u in MOCK_USERS.values():
            if u["email"] == req.email:
                user = u
                break
        if not user or not pwd_context.verify(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        token = jwt.encode(
            {"sub": str(user["id"]), "exp": time.time() + 3600*24*7}, 
            JWT_SECRET, 
            algorithm="HS256"
        )
        return {"token": token, "user_id": str(user["id"])}

def get_current_user_from_jwt(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/keys")
async def create_api_key(req: CreateKeyRequest, user_id: str = Depends(get_current_user_from_jwt)):
    raw_key = "cookie_live_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    prefix = raw_key[:18]
    
    if not db.pool:
        # IN-MEMORY MOCK
        MOCK_KEYS[key_hash] = {
            "key_hash": key_hash,
            "user_id": user_id,
            "name": req.name,
            "prefix": prefix,
            "is_active": True,
            "created_at": time.time(),
            "last_used": None
        }
        db.api_keys_cache.add(key_hash)
        return {"raw_key": raw_key, "name": req.name, "prefix": prefix}
        
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO api_keys (key_hash, user_id, name, prefix) VALUES ($1, $2, $3, $4)",
            key_hash, user_id, req.name, prefix
        )
    
    db.api_keys_cache.add(key_hash)
    return {"raw_key": raw_key, "name": req.name, "prefix": prefix}

@router.get("/keys")
async def list_api_keys(user_id: str = Depends(get_current_user_from_jwt)):
    if not db.pool:
        # IN-MEMORY MOCK
        keys = []
        for k in MOCK_KEYS.values():
            if k["user_id"] == user_id and k["is_active"]:
                keys.append(k)
        return keys
        
    async with db.pool.acquire() as conn:
        keys = await conn.fetch(
            "SELECT name, prefix, created_at, last_used, key_hash FROM api_keys WHERE user_id = $1 AND is_active = TRUE", 
            user_id
        )
        return [dict(k) for k in keys]

@router.delete("/keys/{key_hash}")
async def revoke_api_key(key_hash: str, user_id: str = Depends(get_current_user_from_jwt)):
    if not db.pool:
        if key_hash in MOCK_KEYS and MOCK_KEYS[key_hash]["user_id"] == user_id:
            del MOCK_KEYS[key_hash]
        if key_hash in db.api_keys_cache:
            db.api_keys_cache.remove(key_hash)
        return {"status": "success"}
        
    async with db.pool.acquire() as conn:
        await conn.execute("DELETE FROM api_keys WHERE key_hash = $1 AND user_id = $2", key_hash, user_id)
    if key_hash in db.api_keys_cache:
        db.api_keys_cache.remove(key_hash)
    return {"status": "success"}

@router.get("/me/wallet")
async def get_my_wallet(user_id: str = Depends(get_current_user_from_jwt)):
    from backend.main import engine
    return engine.get_wallet(user_id)

@router.get("/me/executions")
async def get_my_executions(user_id: str = Depends(get_current_user_from_jwt)):
    if not db.pool: return []
    async with db.pool.acquire() as conn:
        trades = await conn.fetch(
            "SELECT * FROM executions WHERE buyer_id = $1 OR seller_id = $1 ORDER BY executed_at DESC LIMIT 50",
            user_id
        )
        return [dict(t) for t in trades]
