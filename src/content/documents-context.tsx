import { createContext } from "react";
import type { ReferenceDocument } from "./payload";
export const ContentDocumentsContext = createContext<ReferenceDocument[]>([]);
