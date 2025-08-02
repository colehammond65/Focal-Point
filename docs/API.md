# Focal Point API Documentation

## Overview

The Focal Point application provides a RESTful API for managing photography galleries, client deliveries, and administrative functions. The API is designed for photographers who need to manage their portfolio and deliver photos to clients securely.

## Authentication

The application uses session-based authentication for admin users and basic authentication for client access to private galleries.

### Admin Authentication
- **Login Endpoint**: `POST /admin/login`
- **Session Management**: Express sessions with secure cookies
- **Rate Limiting**: 5 attempts per 15 minutes per IP

### Client Authentication
- **Login Endpoint**: `POST /client/login`
- **Access Method**: Username/password for private gallery access
- **Session Duration**: Configurable per client

## Base URLs

- **Development**: `http://localhost:3000`
- **Production**: Configured via environment variables

## Rate Limiting

All API endpoints are protected by rate limiting:
- **Admin endpoints**: 100 requests per 15 minutes
- **Login endpoints**: 5 attempts per 15 minutes
- **General endpoints**: Standard Express defaults

## Content Types

- **Request**: `application/json` for JSON APIs, `multipart/form-data` for file uploads
- **Response**: `application/json` for API responses, `text/html` for web pages

---

## Admin API Endpoints

### Gallery Management

#### Get All Categories
```http
GET /admin/api/categories
```

**Response:**
```json
{
  "categories": [
    {
      "name": "weddings",
      "preview": "photo1.jpg",
      "imageCount": 25
    }
  ]
}
```

#### Create Category
```http
POST /admin/api/categories
Content-Type: application/json

{
  "name": "new-category"
}
```

#### Delete Category
```http
DELETE /admin/api/categories/:categoryName
```

#### Get Category Images
```http
GET /admin/api/categories/:categoryName/images
```

**Response:**
```json
{
  "images": [
    {
      "id": 1,
      "filename": "image.jpg",
      "alt_text": "Description",
      "position": 0,
      "is_thumbnail": false
    }
  ]
}
```

### Image Management

#### Upload Images
```http
POST /admin/upload/:categoryName
Content-Type: multipart/form-data

files: [File, File, ...]
```

#### Update Image Order
```http
POST /admin/api/categories/:categoryName/order
Content-Type: application/json

{
  "order": ["image1.jpg", "image2.jpg"]
}
```

#### Set Category Thumbnail
```http
POST /admin/api/categories/:categoryName/thumbnail
Content-Type: application/json

{
  "filename": "image.jpg"
}
```

#### Update Image Alt Text
```http
PUT /admin/api/images/:imageId/alt
Content-Type: application/json

{
  "alt_text": "New description"
}
```

#### Delete Image
```http
DELETE /admin/api/images/:imageId
```

### Settings Management

#### Get All Settings
```http
GET /admin/api/settings
```

**Response:**
```json
{
  "siteTitle": "My Photography",
  "accentColor": "#ff6b6b",
  "favicon": "favicon.ico",
  "headerImage": "header.jpg"
}
```

#### Update Setting
```http
PUT /admin/api/settings/:key
Content-Type: application/json

{
  "value": "New Value"
}
```

### Client Management

#### Get All Clients
```http
GET /admin/api/clients
```

**Response:**
```json
{
  "clients": [
    {
      "id": 1,
      "name": "John Doe",
      "username": "johndoe",
      "gallery_name": "Wedding 2024",
      "is_active": true,
      "download_count": 5,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Create Client
```http
POST /admin/api/clients
Content-Type: application/json

{
  "name": "Client Name",
  "username": "username",
  "password": "password",
  "gallery_name": "Gallery Name"
}
```

#### Toggle Client Status
```http
POST /admin/api/clients/:clientId/toggle
```

#### Delete Client
```http
DELETE /admin/api/clients/:clientId
```

### Backup Management

#### Create Backup
```http
POST /admin/api/backup
```

#### Get Backup List
```http
GET /admin/api/backups
```

#### Download Backup
```http
GET /admin/api/backups/:filename
```

#### Delete Backup
```http
DELETE /admin/api/backups/:filename
```

---

## Client API Endpoints

### Gallery Access

#### Client Login
```http
POST /client/login
Content-Type: application/json

{
  "username": "client_username",
  "password": "client_password"
}
```

#### Get Client Gallery
```http
GET /client/gallery/:clientId
```

**Response:**
```json
{
  "client": {
    "name": "John Doe",
    "gallery_name": "Wedding 2024"
  },
  "images": [
    {
      "id": 1,
      "filename": "photo1.jpg",
      "original_name": "DSC_0001.jpg"
    }
  ]
}
```

#### Download Single Image
```http
GET /client/download/:clientId/:imageId
```

#### Download All Images (ZIP)
```http
GET /client/download-zip/:clientId
```

---

## Public API Endpoints

### Gallery Viewing

#### Get Home Page
```http
GET /
```

#### Get Category Gallery
```http
GET /gallery/:categoryName
```

#### Get About Page
```http
GET /about
```

---

## Error Responses

All API endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Common Error Codes

- **400 Bad Request**: Invalid request parameters
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

---

## File Upload Specifications

### Supported Image Formats
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)

### File Size Limits
- **Maximum file size**: 10MB per image
- **Maximum files per upload**: 20 images

### Image Processing
- **Thumbnails**: Automatically generated at 300x300px
- **Optimization**: JPEG quality set to 85%
- **Metadata**: EXIF data preserved

---

## Security Considerations

### File Upload Security
- File type validation using magic numbers
- Filename sanitization
- Upload size limits
- Virus scanning (recommended for production)

### Session Security
- Secure cookie flags in production
- Session regeneration on login
- CSRF protection enabled

### Rate Limiting
- IP-based rate limiting
- Progressive delays for repeated violations
- Configurable limits per endpoint

---

## Development and Testing

### Environment Variables
```env
SESSION_SECRET=your-random-secret-here
TRUST_PROXY=false
NODE_ENV=development
```

### Testing Endpoints
Use the provided test suite or tools like Postman to test API endpoints.

### Logging
All API requests are logged with request ID, method, URL, and response time.

---

## Changelog

### Version 1.0.0
- Initial API implementation
- Admin gallery management
- Client photo delivery
- Session-based authentication
- Rate limiting and security features

For additional support or feature requests, please visit the project repository.