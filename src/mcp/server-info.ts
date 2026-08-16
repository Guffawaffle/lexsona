import { VERSION } from "../version.js";

/** Package identity advertised during the MCP initialization handshake. */
export const LEXSONA_MCP_SERVER_INFO = {
  name: "lexsona",
  version: VERSION,
} as const;
