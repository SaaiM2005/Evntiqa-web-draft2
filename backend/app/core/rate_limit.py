from slowapi import Limiter

from app.core.security import client_ip

# In-memory storage is fine for a single API container. Point `storage_uri` at Redis
# before scaling to more than one replica.
limiter = Limiter(key_func=client_ip)
