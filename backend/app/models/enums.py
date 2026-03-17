from enum import Enum


class UserRole(str, Enum):
    ADMIN = "Admin"
    FINANCE = "Finance"
    OPERATIONS = "Operations"
    VIEWER = "Viewer"


class InterpreterStatus(str, Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"
    ON_HOLD = "On Hold"
    FULLY_ONBOARDED = "Fully Onboarded"
    TERMINATED = "Terminated"
    DEACTIVATED = "Deactivated"
    RESIGNED = "Resigned"


class PaymentFrequency(str, Enum):
    WEEKLY = "Weekly"
    BIWEEKLY = "Biweekly"
    MONTHLY = "Monthly"
