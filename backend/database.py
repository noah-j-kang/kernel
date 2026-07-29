import os
import asyncpg
import asyncio
from typing import List, Dict
import datetime

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")

class Database:
    def __init__(self):
        self.pool = None
        self.api_keys_cache = set()

    async def connect(self):
        try:
            self.pool = await asyncpg.create_pool(DATABASE_URL)
            await self.load_api_keys()
            print("Connected to PostgreSQL successfully.")
        except Exception as e:
            print(f"Failed to connect to database (ignoring for local dev without postgres): {e}")

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def load_api_keys(self):
        if not self.pool: return
        async with self.pool.acquire() as conn:
            try:
                rows = await conn.fetch("SELECT key_hash FROM api_keys")
                self.api_keys_cache = {row['key_hash'] for row in rows}
            except Exception as e:
                print(f"Failed to load API keys (schema might not be created): {e}")

    async def validate_api_key(self, key_hash: str) -> bool:
        # O(1) in-memory lookup
        return key_hash in self.api_keys_cache

    async def bulk_insert_executions(self, trades: List[dict], wallets: Dict[str, dict]):
        if not self.pool: return
        
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Insert executions
                if trades:
                    # Execute executemany is safer for mixed types in asyncpg than copy_records if we just want basic inserts
                    query = """
                        INSERT INTO executions (id, buyer_id, seller_id, instrument_id, price, quantity, executed_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """
                    records = [
                        (
                            t['id'], 
                            t['buyer_id'], 
                            t['seller_id'], 
                            t.get('instrument_id', 'KERNEL-USD-SPOT'),
                            t['price'], 
                            t['quantity'], 
                            datetime.datetime.fromtimestamp(t['executed_at'], tz=datetime.timezone.utc)
                        ) for t in trades
                    ]
                    await conn.executemany(query, records)
                
                # Update wallets
                if wallets:
                    wallet_query = """
                        INSERT INTO wallets (user_id, usd_balance, kernel_balance, margin_usd, kernel_perp, kernel_perp_entry, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, NOW())
                        ON CONFLICT (user_id) DO UPDATE SET
                            usd_balance = EXCLUDED.usd_balance,
                            kernel_balance = EXCLUDED.kernel_balance,
                            margin_usd = EXCLUDED.margin_usd,
                            kernel_perp = EXCLUDED.kernel_perp,
                            kernel_perp_entry = EXCLUDED.kernel_perp_entry,
                            updated_at = NOW();
                    """
                    wallet_records = [
                        (uid, w['usd'], w['kernel'], w.get('margin_usd', 0.0), w.get('kernel_perp', 0.0), w.get('kernel_perp_entry', 0.0)) for uid, w in wallets.items()
                    ]
                    await conn.executemany(wallet_query, wallet_records)

db = Database()
