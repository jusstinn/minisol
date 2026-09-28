"use client";

import { createContext, useContext } from "react";

/**
 * Cart actions for panels deep in the board (the shopping list's "Rezervă pentru ridicare"),
 * without threading props through Board and the phone tabs. Provided by the Workspace.
 */
export const CartActionsContext = createContext<{ reserve: () => void } | null>(null);

export const useCartActions = () => useContext(CartActionsContext);
