#!/usr/bin/env python3
"""Register/Login Telegram account via Telethon"""

import asyncio
import sys
import os

# Telegram Desktop open source API credentials
API_ID = 2040
API_HASH = "b18441a1ff607e10a989891a5462e627"
PHONE = "+13239037711"
SESSION_FILE = os.path.join(os.path.dirname(__file__), "telegram_session")

# Use SOCKS5 proxy
import socks
proxy = (socks.SOCKS5, '127.0.0.1', 7880)

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError

async def main():
    client = TelegramClient(SESSION_FILE, API_ID, API_HASH, proxy=proxy)
    
    print(f"Connecting to Telegram with {PHONE}...")
    await client.connect()
    
    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"Already logged in as: {me.first_name} (@{me.username})")
        await client.disconnect()
        return
    
    # Send code
    print("Sending verification code...")
    result = await client.send_code_request(PHONE)
    print(f"Code sent! phone_code_hash: {result.phone_code_hash}")
    print(f"Check SMS on {PHONE}")
    print()
    print("WAITING FOR CODE - run verify.py with the code")
    
    # Save hash for verification step
    with open(os.path.join(os.path.dirname(__file__), ".code_hash"), "w") as f:
        f.write(result.phone_code_hash)
    
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
