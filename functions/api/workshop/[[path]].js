import { handleWorkshop } from '../../../workshop/api.mjs';

export function onRequest(context) {
  return handleWorkshop(context.request, context.env);
}
