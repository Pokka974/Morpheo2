import { useServicesContext } from './ServicesProvider';
import type { ServiceRegistry } from './registry';

export function useServices(): ServiceRegistry {
  return useServicesContext();
}
