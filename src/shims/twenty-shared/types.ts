// Local shim for twenty-shared/types
// The twenty-sdk type declarations reference twenty-shared/types but the package
// is not published with proper subpath exports. This shim provides the types
// needed by this app's view definitions.

export enum ViewType {
  TABLE = 'TABLE',
  KANBAN = 'KANBAN',
  CALENDAR = 'CALENDAR',
  FIELDS_WIDGET = 'FIELDS_WIDGET',
}

export enum ViewKey {
  INDEX = 'INDEX',
}

export enum ViewFilterOperand {
  IS = 'IS',
  IS_NOT_NULL = 'IS_NOT_NULL',
  IS_NOT = 'IS_NOT',
  LESS_THAN_OR_EQUAL = 'LESS_THAN_OR_EQUAL',
  GREATER_THAN_OR_EQUAL = 'GREATER_THAN_OR_EQUAL',
  IS_BEFORE = 'IS_BEFORE',
  IS_AFTER = 'IS_AFTER',
  CONTAINS = 'CONTAINS',
  DOES_NOT_CONTAIN = 'DOES_NOT_CONTAIN',
  IS_EMPTY = 'IS_EMPTY',
  IS_NOT_EMPTY = 'IS_NOT_EMPTY',
  IS_RELATIVE = 'IS_RELATIVE',
  IS_IN_PAST = 'IS_IN_PAST',
  IS_IN_FUTURE = 'IS_IN_FUTURE',
  IS_TODAY = 'IS_TODAY',
  VECTOR_SEARCH = 'VECTOR_SEARCH',
}
