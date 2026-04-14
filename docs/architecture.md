# Architecture (Phase 1 MVP)

## 1. High-Level
- React app (Vercel) authenticates users with Cognito.
- React sends Cognito access token to API Gateway (`Authorization: Bearer <JWT>`).
- API Gateway invokes Lambda handlers.
- Lambdas enforce roles from JWT claims and read/write DynamoDB + S3.

## 2. Roles
- `Admin`: full access
- `Manager`: artist/task management, read finance
- `Finance`: transaction and payout operations

Cognito groups map directly to role names.

## 3. DynamoDB Single-Table
Table: `PyongRecords`

Primary access patterns:
- Artist profile: `PK=ARTIST#{artistId}, SK=METADATA`
- Artist tasks: `PK=ARTIST#{artistId}, SK begins_with TASK#`
- Artist transactions: `PK=ARTIST#{artistId}, SK begins_with TRANSACTION#`
- Artist contracts: `PK=ARTIST#{artistId}, SK begins_with CONTRACT#`
- User metadata: `PK=USER#{userId}, SK=METADATA`

GSIs:
- `GSI1` (task assignee): `GSI1PK=ASSIGNEE#{userId}`, `GSI1SK=DUE#{dueDate}#TASK#{taskId}`
- `GSI2` (task due date): `GSI2PK=TASK`, `GSI2SK=DUE#{dueDate}#TASK#{taskId}`
- `GSI3` (transaction date): `GSI3PK=TRANSACTION`, `GSI3SK=DATE#{date}#TX#{transactionId}`

## 4. API Routes
- `GET /artists`
- `GET /artists/{id}`
- `POST /artists`
- `PUT /artists/{id}`
- `DELETE /artists/{id}`
- `GET /artists/{id}/tasks`
- `GET /tasks/me`
- `POST /tasks`
- `PATCH /tasks/{id}`
- `GET /artists/{id}/transactions`
- `POST /transactions`
- `GET /dashboard`
- `POST /uploads/presign`

## 5. Security
- Cognito authorizer required on all routes.
- IAM policy scoped to MVP table + S3 bucket only.
- Uploads use pre-signed URLs to avoid exposing AWS keys in frontend.
- Lambda validates role permissions before mutating data.

## 6. Commission Logic
For income entries:
- `commissionAmount = amount * (commissionRate / 100)`
- `artistNetAmount = amount - commissionAmount`

Commission rate comes from artist metadata (default configurable, fallback 20%).

## 7. Next Phases
- Audit trail table/stream
- Payment integrations (Mobile Money)
- Notifications (SNS/SES/WhatsApp)
- Reporting exports (CSV/PDF)
