# Setup Guide

## Prerequisites
- AWS CLI configured (`aws configure`)
- AWS SAM CLI installed
- Node.js 20+

## 1) Backend Build
```bash
cd backend
npm install
npm run build
```

## 2) Deploy Infra + API
```bash
cd ../infra
sam build
sam deploy --guided
```

When prompted:
- Stack name: `ria-mvp`
- Region: choose your target region (for Uganda teams, `eu-west-1` is often a good latency option)
- Save arguments: `Y`

## 3) Create First Users
Use Cognito console after deployment:
1. Create user accounts.
2. Assign users to one of the groups: `Admin`, `Manager`, `Finance`.

## 4) Frontend Configure + Run
```bash
cd ../frontend
npm install
cp .env.example .env
```

Set values from CloudFormation outputs, then:
```bash
npm run dev
```

## 5) Vercel Deployment
1. Import `frontend` directory as project.
2. Set same environment variables in Vercel.
3. Deploy.
