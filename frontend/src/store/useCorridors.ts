import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Corridor } from '../api/types';

let cachedCorridors: Corridor[] | null = null;
let promise: Promise<Corridor[]> | null = null;

export function useCorridors() {
  const [corridors, setCorridors] = useState<Corridor[]>(cachedCorridors || []);

  useEffect(() => {
    if (cachedCorridors) return;
    if (!promise) {
      promise = api.getCorridors().then(data => {
        cachedCorridors = data;
        return data;
      });
    }
    promise.then(setCorridors);
  }, []);

  return corridors;
}
