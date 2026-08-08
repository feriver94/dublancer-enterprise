import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL?.trim();
const baseUrl = process.env.RESTORE_BASE_URL?.trim();
const password = process.env.RESTORE_FIXTURE_PASSWORD;
if (!databaseUrl || !baseUrl || !password) {
  throw new Error("DATABASE_URL, RESTORE_BASE_URL, and RESTORE_FIXTURE_PASSWORD are required.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  const user = await prisma.user.findFirst({
    where: { email: { startsWith: "browser-client-" } },
    orderBy: { createdAt: "asc" },
    select: {
      email: true,
      passwordHash: true,
      memberships: {
        where: { status: "ACTIVE" },
        take: 1,
        select: { organizationId: true },
      },
    },
  });
  assert.ok(user?.email && user.passwordHash && user.memberships[0]?.organizationId, "Restored authentication fixture is incomplete.");

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { accept: "application/json" } });
  assert.equal(csrfResponse.status, 200);
  const csrfBody = await csrfResponse.json();
  const cookies = new Map();
  const absorb = (values) => {
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  };
  const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  absorb(csrfResponse.headers.getSetCookie());
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      cookie: cookieHeader(),
      origin: baseUrl,
      "x-csrf-token": csrfBody.data.csrfToken,
    },
    body: JSON.stringify({
      email: user.email,
      password,
      organizationId: user.memberships[0].organizationId,
    }),
  });
  assert.equal(loginResponse.status, 200, "Restored authentication fixture could not log in.");
  absorb(loginResponse.headers.getSetCookie());
  const personasResponse = await fetch(`${baseUrl}/api/personas`, {
    headers: { accept: "application/json", cookie: cookieHeader() },
  });
  assert.equal(personasResponse.status, 200, "Restored authenticated session could not read personas.");
  const personas = await personasResponse.json();
  assert.ok(personas.data?.account?.accountPersonas?.length > 0, "Restored account personas are missing.");
  console.log(JSON.stringify({ result: "PASS", restoredAuthentication: true, restoredPersonaSession: true }, null, 2));
} finally {
  await prisma.$disconnect();
}
