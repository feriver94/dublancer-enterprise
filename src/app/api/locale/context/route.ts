import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getLocaleContext } from "@/lib/locale/request-locale";

export async function GET() {
  try {
    return apiSuccess(await getLocaleContext());
  } catch (error) {
    return apiError(error);
  }
}
