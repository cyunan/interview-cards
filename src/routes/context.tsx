import { createContext, useContext } from "react";
import { KNOWLEDGE_ROUTES } from "./routes";
export const KnowledgeRoutesContext = createContext(KNOWLEDGE_ROUTES);
export const useKnowledgeRoutes = () => useContext(KnowledgeRoutesContext);
