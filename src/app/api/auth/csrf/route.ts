import { apiError, apiSuccess } from "@/lib/http/api-response";
import { issueCsrfToken } from "@/lib/auth/csrf";
export async function GET(){try{return apiSuccess({csrfToken:await issueCsrfToken()})}catch(e){return apiError(e)}}
