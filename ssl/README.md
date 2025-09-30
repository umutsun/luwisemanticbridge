# SSL/TLS Certificates

This directory should contain your SSL/TLS certificates for production deployment.

## Required Files

- `cert.pem` - Your SSL certificate
- `key.pem` - Your private key
- `chain.pem` - Certificate chain (optional)

## Certificate Sources

### Let's Encrypt (Recommended)
```bash
# Install certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/key.pem
sudo cp /etc/letsencrypt/live/your-domain.com/chain.pem ssl/chain.pem
```

### Self-Signed (Development Only)
```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes
```

## Security Notes

- Never commit private keys to version control
- Ensure proper file permissions: `chmod 600 ssl/key.pem`
- Use strong encryption (at least 2048-bit RSA or 256-bit ECC)
- Regularly renew certificates before expiration