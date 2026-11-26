import { createContext } from 'react';
import type { InventoryOutbox } from './inventory-outbox.ts';

export const OutboxContext = createContext<InventoryOutbox | null>(null);
