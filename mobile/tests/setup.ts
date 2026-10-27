import "@testing-library/react-native/matchers";

jest.mock("react-native-worklets", () => ({}));

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      renderAsync: async () => ({
        saveAsync: async () => ({
          uri: "file:///cache/moment.jpg",
          width: 100,
          height: 100,
        }),
      }),
    }),
  },
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, ios: { status: 3 } })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, ios: { status: 3 } })),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "id"),
  getDevicePushTokenAsync: jest.fn(async () => ({ data: "token" })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setBadgeCountAsync: jest.fn(async () => undefined),
  AndroidImportance: { HIGH: 4 },
  IosAuthorizationStatus: { PROVISIONAL: 3, AUTHORIZED: 2, DENIED: 1, NOT_DETERMINED: 0 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
}));

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const identity = (value: unknown) => value;
  const easing = () => identity;
  return {
    __esModule: true,
    default: { View, Text: View, createAnimatedComponent: (component: unknown) => component },
    Easing: {
      linear: identity,
      cubic: identity,
      quad: identity,
      out: easing,
      in: easing,
      inOut: easing,
    },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (factory: () => object) => factory(),
    withTiming: identity,
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

jest.mock("expo-router", () => {
  const React = require("react");
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    usePathname: () => "/",
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => effect(), []);
    },
    Link: ({ children }: { children: React.ReactNode }) => children,
    Stack: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("@/src/db/schema", () => ({
  loadCachedCategories: jest.fn(async () => []),
  cacheCategories: jest.fn(async () => undefined),
  loadCachedCalendar: jest.fn(async () => null),
  cacheCalendar: jest.fn(async () => undefined),
  enqueueOutbox: jest.fn(async () => 1),
  listPendingOutbox: jest.fn(async () => []),
  markOutboxSynced: jest.fn(async () => undefined),
  markCalendarDayOptimistic: jest.fn(async () => undefined),
}));

jest.mock("@/src/api/categories", () => ({
  listCategories: jest.fn(async () => []),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  removeCategoryFromGroup: jest.fn(),
  assignCategoryToGroup: jest.fn(),
}));

jest.mock("@/src/api/groups", () => ({
  listGroups: jest.fn(async () => []),
  listGroupsForRitual: jest.fn(async () => []),
  getGroup: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
}));

jest.mock("@/src/api/goals", () => ({
  getGroupSummary: jest.fn(async () => ({ groups: [] })),
  setGoal: jest.fn(),
  deactivateGoal: jest.fn(),
}));

jest.mock("@/src/api/calendar", () => ({
  fetchCalendar: jest.fn(async () => ({ days: [] })),
}));

jest.mock("@/src/api/recaps", () => ({
  fetchRecapIndex: jest.fn(async () => ({})),
}));

jest.mock("@/src/api/onboarding", () => ({
  fetchOnboardingStatus: jest.fn(async () => ({
    onboarding_completed: false,
    onboarding_completed_at: null,
    tracking_mode: "solo",
    active_goal_count: 0,
    available_template_count: 0,
    inherited_shared_templates: [],
    together_goals: [],
    partnership: null,
  })),
  fetchOnboardingTemplates: jest.fn(async () => ({ templates: [], by_group: {} })),
  setupOnboarding: jest.fn(async () => ({
    created_goal_count: 0,
    email_sent: false,
    partnership: null,
    onboarding: { onboarding_completed: true },
  })),
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
