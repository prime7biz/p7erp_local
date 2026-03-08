import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  method: string = "GET",
  data?: unknown | undefined,
): Promise<Response> {
  console.log(`Making ${method} request to ${url}`);
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include", // Important for cookies
    });

    if (!res.ok) {
      let errorMessage = res.statusText;
      let errorDetails: Record<string, any> | null = null;
      try {
        const errorData = await res.json();
        errorMessage = errorData.message || errorMessage;
        if (errorData.errors) {
          errorDetails = errorData.errors;
          const details = Object.entries(errorData.errors)
            .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
            .join('; ');
          if (details) {
            errorMessage = `${errorMessage} - ${details}`;
          }
        }
      } catch (e) {
        try {
          const errorText = await res.text();
          errorMessage = errorText || errorMessage;
        } catch (textError) {
        }
      }
      
      console.error(`API error (${res.status}): ${errorMessage}`);
      
      if (res.status === 401) {
        console.warn("Authentication required - user not logged in");
      }
      
      throw new Error(errorMessage);
    }
    
    return res;
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      console.log("Making authenticated request to:", queryKey[0]);
      const res = await fetch(queryKey[0] as string, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("Response status:", res.status, "for", queryKey[0]);

      if (res.status === 401) {
        console.log("401 Unauthorized response for", queryKey[0]);
        if (unauthorizedBehavior === "returnNull") {
          return null;
        } else {
          // For auth endpoints, we want to throw the error
          throw new Error("Authentication required");
        }
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error("Query error:", error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
