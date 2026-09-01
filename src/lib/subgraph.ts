import { isAddress } from "viem";

export type SubgraphActivity = {
  id: string;
  kind: string;
  label: string;
  amount?: string;
  tokenId?: string;
  timestamp?: number;
  transactionHash?: string;
};

type GraphQLTypeRef = {
  kind: string;
  name: string | null;
  ofType: GraphQLTypeRef | null;
};

type GraphField = {
  name: string;
  args: { name: string }[];
  type: GraphQLTypeRef;
};

type GraphEntityField = {
  name: string;
  type: GraphQLTypeRef;
};

type GraphSchema = {
  queryType: { fields: GraphField[] };
  types: {
    kind: string;
    name: string | null;
    fields: GraphEntityField[] | null;
  }[];
};

type GraphSchemaResponse = { __schema: GraphSchema };

type GraphResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

const ACTIVITY_ROOT_PATTERN = /stake|unstake|deposit|withdraw|claim|reward|activity|position/i;
const ADDRESS_FIELD_PATTERN = /owner|user|account|wallet|depositor|staker|recipient|sender|from|to/i;
const FIELD_ALLOWLIST = new Set([
  "id",
  "owner",
  "user",
  "account",
  "wallet",
  "depositor",
  "staker",
  "recipient",
  "sender",
  "from",
  "to",
  "tokenId",
  "amount",
  "value",
  "principal",
  "reward",
  "rewards",
  "newPrincipal",
  "blockTimestamp",
  "timestamp",
  "createdAt",
  "transactionHash",
  "txHash",
  "eventType",
  "action",
  "type",
  "rarity",
  "tier",
]);

function namedType(type: GraphQLTypeRef): string | null {
  if (type.name) return type.name;
  return type.ofType ? namedType(type.ofType) : null;
}

function getSubgraphUrl() {
  if (process.env.THE_GRAPH_QUERY_URL) return process.env.THE_GRAPH_QUERY_URL;
  const apiKey = process.env.THE_GRAPH_QUERY_API_KEY;
  const slug = process.env.THE_GRAPH_SUBGRAPH_SLUG ?? "nuxgraph";
  const version = process.env.THE_GRAPH_SUBGRAPH_VERSION ?? "0.1.0";
  if (!apiKey) return null;
  return `https://api.studio.thegraph.com/query/${apiKey}/${slug}/${version}`;
}

async function queryGraph<T>(query: string, variables?: Record<string, unknown>) {
  const url = getSubgraphUrl();
  if (!url) return { configured: false as const, data: null, error: "Subgraph endpoint is not configured." };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.THE_GRAPH_QUERY_API_KEY) {
    headers.Authorization = `Bearer ${process.env.THE_GRAPH_QUERY_API_KEY}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = (await response.json()) as GraphResponse<T>;
  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.map((error) => error.message).join("; ") ?? `Subgraph request failed (${response.status}).`;
    return { configured: true as const, data: null, error: message };
  }
  return { configured: true as const, data: payload.data ?? null, error: null };
}

async function getSchema() {
  return queryGraph<GraphSchemaResponse>(`query SubgraphSchema {
    __schema {
      queryType {
        fields {
          name
          args { name }
          type { kind name ofType { kind name ofType { kind name } } }
        }
      }
      types {
        kind
        name
        fields {
          name
          type { kind name ofType { kind name ofType { kind name } } }
        }
      }
    }
  }`);
}

function scalarFields(fields: GraphEntityField[]) {
  return fields
    .filter((field) => FIELD_ALLOWLIST.has(field.name) && (field.type.kind === "SCALAR" || field.type.kind === "ENUM" || field.type.ofType?.kind === "SCALAR" || field.type.ofType?.kind === "ENUM"))
    .map((field) => field.name);
}

function activityLabel(rootName: string, row: Record<string, unknown>) {
  const explicit = [row.eventType, row.action, row.type].find((value) => typeof value === "string");
  if (explicit) return String(explicit);
  return rootName.replace(/s$/, "");
}

function findAddress(value: unknown, address: string): boolean {
  if (typeof value === "string") return value.toLowerCase() === address.toLowerCase();
  if (Array.isArray(value)) return value.some((item) => findAddress(item, address));
  if (value && typeof value === "object") return Object.values(value).some((item) => findAddress(item, address));
  return false;
}

function pickString(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number" || typeof value === "bigint") return String(value);
  }
  return undefined;
}

function normalizeActivity(rootName: string, row: Record<string, unknown>): SubgraphActivity {
  const timestamp = pickString(row, ["timestamp", "blockTimestamp", "createdAt"]);
  const transactionHash = pickString(row, ["transactionHash", "txHash"]);
  return {
    id: pickString(row, ["id", "transactionHash", "txHash"]) ?? `${rootName}-${Math.random()}`,
    kind: rootName,
    label: activityLabel(rootName, row),
    amount: pickString(row, ["amount", "value", "principal", "reward", "rewards", "newPrincipal"]),
    tokenId: pickString(row, ["tokenId"]),
    timestamp: timestamp ? Number(timestamp) : undefined,
    transactionHash,
  };
}

export async function fetchSubgraphActivity(address: string) {
  if (!isAddress(address)) return { configured: false, activities: [], error: "Invalid wallet address." };
  const schemaResult = await getSchema();
  if (!schemaResult.configured || !schemaResult.data) {
    return { configured: schemaResult.configured, activities: [], error: schemaResult.error };
  }

  const schema = schemaResult.data.__schema;
  const entities = new Map<string, GraphEntityField[]>();
  for (const type of schema.types) {
    if (type.name && type.fields) entities.set(type.name, type.fields);
  }
  const roots = schema.queryType.fields.filter((field) => ACTIVITY_ROOT_PATTERN.test(field.name));
  const selections = roots.flatMap((root) => {
    const unsupportedArgs = root.args.filter((arg) => !["first", "skip", "where", "orderBy", "orderDirection"].includes(arg.name));
    if (unsupportedArgs.length || (root.args.length > 0 && !root.args.some((arg) => arg.name === "first"))) return [];
    const typeName = namedType(root.type);
    const fields = typeName ? scalarFields(entities.get(typeName) ?? []) : [];
    if (!fields.some((field) => ADDRESS_FIELD_PATTERN.test(field))) return [];
    if (!fields.includes("id")) fields.unshift("id");
    return [`${root.name}${root.args.some((arg) => arg.name === "first") ? "(first: 50)" : ""} { ${fields.join(" ")} }`];
  });

  if (!selections.length) {
    return { configured: true, activities: [], error: "The subgraph schema has no address-indexed activity entities yet." };
  }

  const query = `query UserActivity { ${selections.join(" ")} }`;
  const result = await queryGraph<Record<string, Record<string, unknown>[]> | null>(query);
  if (!result.data) return { configured: true, activities: [], error: result.error };

  const activities = Object.entries(result.data)
    .flatMap(([rootName, rows]) => (Array.isArray(rows) ? rows : []).filter((row) => findAddress(row, address)).map((row) => normalizeActivity(rootName, row)))
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, 20);
  return { configured: true, activities, error: null };
}
