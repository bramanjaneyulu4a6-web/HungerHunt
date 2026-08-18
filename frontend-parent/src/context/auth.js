import { createContext, useContext } from 'react';

/* The context and its hook live apart from the provider that fills them.
   A module that exports a component and something else defeats fast refresh:
   the bundler can only swap a module in place while it is components all the
   way through, so editing AuthContext.jsx used to reload the whole app and
   sign the developer out. */

export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);
