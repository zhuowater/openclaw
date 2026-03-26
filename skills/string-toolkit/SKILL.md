---
name: string-toolkit
description: Swiss-army-knife for string encoding, decoding, hashing, and analysis. Use when asked to base64 encode/decode, hex encode/decode, URL encode/decode, compute hashes (MD5/SHA/SHA-256), decode JWTs, test regex patterns, generate UUIDs, create random strings, or get string statistics. Triggers on "encode", "decode", "hash", "base64", "hex", "jwt decode", "regex test", "uuid", "random string", "字符串", "编码", "解码", "哈希".
---

# string-toolkit

Replace ad-hoc `echo | base64`, `sha256sum`, `python -c` calls with one Node.js tool.

## Commands

```bash
S=/root/openclaw/skills/string-toolkit/index.js

# Encoding/Decoding
node $S b64e "hello world"       # Base64 encode
node $S b64d "aGVsbG8gd29ybGQ="  # Base64 decode
node $S hexe "hello"             # Hex encode
node $S hexd "68656c6c6f"        # Hex decode
node $S urle "key=val&foo=bar"   # URL encode
node $S urld "key%3Dval"         # URL decode
node $S htmle '<script>alert(1)</script>'  # HTML escape
node $S htmld '&lt;b&gt;bold&lt;/b&gt;'   # HTML unescape

# Hashing
node $S hash "check this"   # All hashes (MD5/SHA1/SHA256/SHA512)
node $S md5 "quick check"   # MD5 only
node $S sha256 "verify me"  # SHA-256 only

# JWT (decode only, no verification)
node $S jwt "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.xxx"

# Regex Testing
node $S regex "\d+" g "abc 123 def 456"

# String Stats
node $S stats "Hello World 你好"

# Generators
node $S uuid                  # UUID v4
node $S random 32 alphanumeric  # Random string (charsets: alphanumeric, alpha, hex, numeric, safe)
```

## Piping Support

```bash
echo "secret data" | node $S sha256
cat token.txt | node $S jwt
```

## Programmatic Use

```js
const { base64Encode, hashAll, jwtDecode } = require('./skills/string-toolkit');
console.log(base64Encode('hello'));
console.log(hashAll('verify'));
```
