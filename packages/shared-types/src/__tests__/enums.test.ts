import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUS_ACTORS,
  ORDER_STATUS_SEQUENCE,
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
  TERMINAL_ORDER_STATUSES,
  UserRole,
  canRoleSetOrderStatus,
  canTransitionOrderStatus,
  isTerminalOrderStatus,
} from '../enums';

/* ---------------------------------------------------------------------------
 * isTerminalOrderStatus
 * ------------------------------------------------------------------------- */

describe('isTerminalOrderStatus', () => {
  it('returns true for DELIVERED', () => {
    expect(isTerminalOrderStatus(OrderStatus.DELIVERED)).toBe(true);
  });

  it('returns true for CANCELLED', () => {
    expect(isTerminalOrderStatus(OrderStatus.CANCELLED)).toBe(true);
  });

  it('returns false for every non-terminal status', () => {
    const nonTerminal = Object.values(OrderStatus).filter(
      (s) => !TERMINAL_ORDER_STATUSES.includes(s)
    );
    for (const status of nonTerminal) {
      expect(isTerminalOrderStatus(status)).toBe(false);
    }
  });
});

/* ---------------------------------------------------------------------------
 * canTransitionOrderStatus
 * ------------------------------------------------------------------------- */

describe('canTransitionOrderStatus', () => {
  it('allows every forward edge in the happy path', () => {
    // Walk the main sequence: PENDING → ACCEPTED → PREPARING → ... → DELIVERED
    for (let i = 0; i < ORDER_STATUS_SEQUENCE.length - 1; i++) {
      const from = ORDER_STATUS_SEQUENCE[i]!;
      const to = ORDER_STATUS_SEQUENCE[i + 1]!;
      expect(canTransitionOrderStatus(from, to)).toBe(true);
    }
  });

  it('allows CANCELLED from any non-terminal status', () => {
    const nonTerminal = ORDER_STATUS_SEQUENCE.filter(
      (s) => !TERMINAL_ORDER_STATUSES.includes(s)
    );
    for (const status of nonTerminal) {
      expect(canTransitionOrderStatus(status, OrderStatus.CANCELLED)).toBe(true);
    }
  });

  it('blocks any transition out of DELIVERED', () => {
    for (const to of Object.values(OrderStatus)) {
      expect(canTransitionOrderStatus(OrderStatus.DELIVERED, to)).toBe(false);
    }
  });

  it('blocks any transition out of CANCELLED', () => {
    for (const to of Object.values(OrderStatus)) {
      expect(canTransitionOrderStatus(OrderStatus.CANCELLED, to)).toBe(false);
    }
  });

  it('blocks skipping steps (PENDING → PREPARING)', () => {
    expect(canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.PREPARING)).toBe(false);
  });

  it('blocks skipping steps (PENDING → ON_THE_WAY)', () => {
    expect(canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.ON_THE_WAY)).toBe(false);
  });

  it('blocks going backwards (PREPARING → ACCEPTED)', () => {
    expect(canTransitionOrderStatus(OrderStatus.PREPARING, OrderStatus.ACCEPTED)).toBe(false);
  });

  it('blocks going backwards (DELIVERED → PENDING)', () => {
    expect(canTransitionOrderStatus(OrderStatus.DELIVERED, OrderStatus.PENDING)).toBe(false);
  });

  it('is consistent with ORDER_STATUS_TRANSITIONS table', () => {
    for (const [from, allowed] of Object.entries(ORDER_STATUS_TRANSITIONS)) {
      for (const to of Object.values(OrderStatus)) {
        const expected = (allowed as readonly string[]).includes(to);
        expect(canTransitionOrderStatus(from as OrderStatus, to)).toBe(expected);
      }
    }
  });
});

/* ---------------------------------------------------------------------------
 * canRoleSetOrderStatus
 * ------------------------------------------------------------------------- */

describe('canRoleSetOrderStatus', () => {
  // Explicit positive cases matching the state machine design
  const allowed: Array<[UserRole, OrderStatus]> = [
    [UserRole.STORE_MANAGER, OrderStatus.ACCEPTED],
    [UserRole.STORE_MANAGER, OrderStatus.PREPARING],
    [UserRole.STORE_MANAGER, OrderStatus.READY_FOR_PICKUP],
    [UserRole.CAPTAIN, OrderStatus.ON_THE_WAY],
    [UserRole.CAPTAIN, OrderStatus.DELIVERED],
    [UserRole.CUSTOMER, OrderStatus.CANCELLED],
    [UserRole.STORE_MANAGER, OrderStatus.CANCELLED],
    [UserRole.CAPTAIN, OrderStatus.CANCELLED],
    [UserRole.ADMIN, OrderStatus.ACCEPTED],
    [UserRole.ADMIN, OrderStatus.PREPARING],
    [UserRole.ADMIN, OrderStatus.READY_FOR_PICKUP],
    [UserRole.ADMIN, OrderStatus.ON_THE_WAY],
    [UserRole.ADMIN, OrderStatus.DELIVERED],
    [UserRole.ADMIN, OrderStatus.CANCELLED],
  ];

  for (const [role, status] of allowed) {
    it(`allows ${role} → ${status}`, () => {
      expect(canRoleSetOrderStatus(role, status)).toBe(true);
    });
  }

  // Explicit negative cases — role boundaries the server enforces
  const denied: Array<[UserRole, OrderStatus]> = [
    [UserRole.CUSTOMER, OrderStatus.ACCEPTED],
    [UserRole.CUSTOMER, OrderStatus.PREPARING],
    [UserRole.CUSTOMER, OrderStatus.READY_FOR_PICKUP],
    [UserRole.CUSTOMER, OrderStatus.ON_THE_WAY],
    [UserRole.CUSTOMER, OrderStatus.DELIVERED],
    [UserRole.CAPTAIN, OrderStatus.ACCEPTED],
    [UserRole.CAPTAIN, OrderStatus.PREPARING],
    [UserRole.CAPTAIN, OrderStatus.READY_FOR_PICKUP],
    [UserRole.STORE_MANAGER, OrderStatus.ON_THE_WAY],
    [UserRole.STORE_MANAGER, OrderStatus.DELIVERED],
  ];

  for (const [role, status] of denied) {
    it(`denies ${role} → ${status}`, () => {
      expect(canRoleSetOrderStatus(role, status)).toBe(false);
    });
  }

  it('is consistent with ORDER_STATUS_ACTORS table', () => {
    for (const [status, actors] of Object.entries(ORDER_STATUS_ACTORS)) {
      for (const role of Object.values(UserRole)) {
        const expected = (actors as readonly string[]).includes(role);
        expect(canRoleSetOrderStatus(role, status as OrderStatus)).toBe(expected);
      }
    }
  });
});

/* ---------------------------------------------------------------------------
 * ORDER_STATUS_SEQUENCE sanity
 * ------------------------------------------------------------------------- */

describe('ORDER_STATUS_SEQUENCE', () => {
  it('starts with PENDING and ends with DELIVERED', () => {
    expect(ORDER_STATUS_SEQUENCE[0]).toBe(OrderStatus.PENDING);
    expect(ORDER_STATUS_SEQUENCE[ORDER_STATUS_SEQUENCE.length - 1]).toBe(OrderStatus.DELIVERED);
  });

  it('does not include CANCELLED (it is a side-exit, not a sequence step)', () => {
    expect(ORDER_STATUS_SEQUENCE).not.toContain(OrderStatus.CANCELLED);
  });

  it('contains all non-cancelled statuses', () => {
    const expected = Object.values(OrderStatus).filter(
      (s) => s !== OrderStatus.CANCELLED
    );
    for (const status of expected) {
      expect(ORDER_STATUS_SEQUENCE).toContain(status);
    }
  });
});
