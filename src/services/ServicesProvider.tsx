import React, { createContext, useContext } from 'react';
import type { ServiceRegistry } from './registry';

const ServicesContext = createContext<ServiceRegistry | null>(null);

interface Props {
  services: ServiceRegistry;
  children: React.ReactNode;
}

export function ServicesProvider({ services, children }: Props) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServicesContext(): ServiceRegistry {
  const ctx = useContext(ServicesContext);
  if (!ctx) {
    throw new Error(
      'useServices() must be called within a <ServicesProvider>. ' +
        'Wrap your root layout with <ServicesProvider services={...}>.'
    );
  }
  return ctx;
}
