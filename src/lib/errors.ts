export class BackendError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

type BackendErrorBody = {
  errorCode?: string;
  message?: string;
};

export const mapBackendError = (
  status: number,
  body: BackendErrorBody,
  requestId: string,
): BackendError => {
  const code = body.errorCode ?? `HTTP_${status}`;
  const message = body.message ?? `Erreur backend ${status}`;
  return new BackendError(code, message, requestId, status);
};
