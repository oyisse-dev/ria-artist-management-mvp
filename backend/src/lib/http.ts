import type { APIGatewayProxyResult } from "aws-lambda";

const baseHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
};

export function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: baseHeaders,
    body: JSON.stringify(body)
  };
}

export function noContent(): APIGatewayProxyResult {
  return { statusCode: 204, headers: baseHeaders, body: "" };
}
