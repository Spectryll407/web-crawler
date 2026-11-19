type Level = "info" | "warn" | "error";

function write(level: Level, requestId: string | undefined, msg: string) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${requestId ?? "-"}] ${msg}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, requestId?: string) => write("info", requestId, msg),
  warn: (msg: string, requestId?: string) => write("warn", requestId, msg),
  error: (msg: string, requestId?: string) => write("error", requestId, msg),
};
