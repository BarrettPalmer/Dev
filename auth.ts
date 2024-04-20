//  /middleware/auth.ts
import { defineNuxtRouteMiddleware } from "#app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import debounce from "lodash/debounce";

// Initialize Firebase authentication and functions services
const auth = getAuth();
const functions = getFunctions();

// Debounce function to prevent rapid repeated updates, which reduces API calls and improves performance
const updateAccountTierDebounced = debounce(async (user: any) => {
  // Create a callable function to update the user's account tier
  const updateAccountTier = httpsCallable(functions, "updateAccountTier");
  try {
    // Call the updateAccountTier function with user UID and handle the response
    const result = await updateAccountTier({ userUid: user.uid });
    // Force refresh the token to get updated custom claims reflecting the new account tier
    return await user.getIdTokenResult(true);
  } catch (error) {
    // Log errors if the function call fails
    console.error("Error updating account tier:", error);
  }
}, 1000); // Debounce for 1 second

// Middleware for handling user state and navigation based on authentication and account status
export default defineNuxtRouteMiddleware(async (to: any, from: any) => {
  // Define a reactive state to indicate loading status
  const loading = useState("loading", () => true);
  loading.value = true;

  // Function to handle redirection based on user state and the intended navigation path
  const handleRedirection = async (user: any, currentPath: any) => {
    // Check if the user object does not exist (user is not logged in)
    if (!user) {
      // Redirect to login page if trying to access protected account pages
      if (currentPath.startsWith("/account")) {
        console.log("Redirecting to login because user is null and trying to access /account");
        return "/login";
      }

      // Allow staying on the login or signup pages if already there
      if (currentPath.startsWith("/login") || currentPath.startsWith("/signup")) {
        console.log("User is null but on login or signup page, no redirection needed.");
        return undefined;
      }
      // Redirect to the home page for all other cases
      return "/";
    }

    // Fetch the current token result to access custom claims
    let idTokenResult = await user.getIdTokenResult();
    let { email_verified, accountType, accountTier } = idTokenResult.claims;

    // Update account tier and type if necessary, and debounced to optimize performance
    if ((!accountTier || accountTier === "" || accountTier === "not active" || !accountType) && user) {
      idTokenResult = await updateAccountTierDebounced(user);
      accountTier = idTokenResult?.claims.accountTier;
      accountType = idTokenResult?.claims.accountType;
    }

    // Handle redirection based on user status, account verification, and current path
    // Conditions check various user states and direct to the appropriate routes
    // For example, unverified users are directed to the confirm email page
    // and users on the payment page after successful payment are directed back to the account page
    if (currentPath.startsWith("/signup") && (!accountTier || accountTier === "not active") && !accountType) {
      return undefined;
    } else if (!email_verified && accountType != "leg" && from.query.success != "true" && (currentPath !== "/confirmemail" || !currentPath.startsWith("/confirmemail"))) {
      return "/confirmemail";
    } else if (!email_verified && (currentPath.startsWith("/account") || currentPath == "/account")) {
      return "/confirmemail";
    } else if (email_verified && from.path === "/payment" && to.path.startsWith("/payment") && to.query.success === "true") {
      return "/account?success=true";
    } else if (email_verified && accountType != "" && currentPath.startsWith("/confirmemail")) {
      return "/account";
    } else if (email_verified && (accountTier === "not active" || accountTier === "" || !accountTier) && accountType === "main" && !currentPath.startsWith("/payment")) {
      return "/payment";
    } else if (email_verified && accountType === "leg" && currentPath.startsWith("/payment")) {
      return "/account";
    } else if (email_verified && user && (currentPath === "/login" || currentPath.startsWith("/signup"))) {
      return "/account";
    } else if (email_verified && user && accountType === "leg" && (currentPath === "/account/primarysettings" || currentPath.startsWith("/Account/LegSettings"))) {
      return "/account/primarysettings";
    } else if (currentPath.startsWith("/signup") && (accountTier || accountTier === "not active") && user) {
      return "/account";
    }
    return undefined;
  };

  // Use Firebase Authentication to monitor authentication state changes
  onAuthStateChanged(auth, async (user) => {
    // Determine if a redirection is necessary based on the user's state and navigation target
    const redirectionPath = await handleRedirection(user, to.path);
    loading.value = false; // Set loading to false when done processing
    if (redirectionPath) {
      // Navigate to the redirection path if one is determined
      return navigateTo(redirectionPath);
    }
  });

  return undefined; // Return undefined to continue with the default route navigation
});


//I am using thin on all pages that need auth check
definePageMeta({
  middleware: ["auth"],
});


// /pages/account/index.ts
<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
});
</script>
