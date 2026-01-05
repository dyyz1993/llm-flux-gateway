# Server Module - Basic Usage Example

## Scenario: Creating a "Notifications" Module

### Step 1: Create Directory Structure

```bash
mkdir -p src/server/module-notifications/{routes,services,__tests__}
```

### Step 2: Define Database Table

Add to `src/server/shared/schema.ts`:

```typescript
export const notificationsTable = mysqlTable('notifications', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### Step 3: Create Service

`src/server/module-notifications/services/notifications-service.ts`:

```typescript
import { getDb } from '@server/shared/database';
import { schema } from '@server/shared/schema';
import { eq } from 'drizzle-orm';

export class NotificationsService {
  async getUserNotifications(userId: string): Promise<Notification[]> {
    const db = getDb();
    return db
      .select()
      .from(schema.notificationsTable)
      .where(eq(schema.notificationsTable.userId, userId))
      .orderBy(schema.notificationsTable.createdAt);
  }

  async createNotification(userId: string, title: string, message: string): Promise<Notification> {
    const db = getDb();
    const [notification] = await db
      .insert(schema.notificationsTable)
      .values({
        id: `notif_${Date.now()}`,
        userId,
        title,
        message,
        isRead: false,
        createdAt: new Date(),
      })
      .returning();
    return notification;
  }

  async markAsRead(id: string): Promise<Notification | null> {
    const db = getDb();
    const [notification] = await db
      .update(schema.notificationsTable)
      .set({ isRead: true })
      .where(eq(schema.notificationsTable.id, id))
      .returning();
    return notification || null;
  }
}
```

### Step 4: Create Routes

`src/server/module-notifications/routes/notifications-routes.ts`:

```typescript
import { Hono } from 'hono';
import { NotificationsService } from '../services/notifications-service';
import { apiResponse, apiError } from '@server/shared';

const service = new NotificationsService();

const router = new Hono()
  .get('/', async (c) => {
    try {
      const userId = c.get('userId') || 'guest';
      const notifications = await service.getUserNotifications(userId);
      return c.json(apiResponse(notifications));
    } catch (error) {
      return c.json(apiError('Failed to fetch notifications'), 500);
    }
  })
  .post('/', async (c) => {
    try {
      const userId = c.get('userId') || 'guest';
      const { title, message } = await c.req.json();

      const notification = await service.createNotification(userId, title, message);

      return c.json(apiResponse(notification), 201);
    } catch (error) {
      return c.json(apiError('Failed to create notification'), 500);
    }
  })
  .put('/:id/read', async (c) => {
    try {
      const id = c.req.param('id');
      const notification = await service.markAsRead(id);

      if (!notification) {
        return c.json(apiError('Notification not found'), 404);
      }

      return c.json(apiResponse(notification));
    } catch (error) {
      return c.json(apiError('Failed to mark notification as read'), 500);
    }
  });

export default router;
```

### Step 5: Mount Routes

Add to `src/server/index.ts`:

```typescript
import notificationsRoutes from './module-notifications/routes/notifications-routes';

app.route('/notifications', notificationsRoutes);
```

### Step 6: Write Tests

`src/server/module-notifications/__tests__/notifications-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsService } from '../notifications-service';

vi.mock('@server/shared', () => ({
  getDb: vi.fn(),
  schema: { notificationsTable: 'notifications' },
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockDb: any;

  beforeEach(() => {
    service = new NotificationsService();
    mockDb = {
      select: vi.fn(function () {
        return this;
      }),
      from: vi.fn(function () {
        return this;
      }),
      where: vi.fn(function () {
        return this;
      }),
      orderBy: vi.fn(function () {
        return this;
      }),
      insert: vi.fn(function () {
        return this;
      }),
      values: vi.fn(function () {
        return this;
      }),
      update: vi.fn(function () {
        return this;
      }),
      set: vi.fn(function () {
        return this;
      }),
    };
    vi.mocked(shared.getDb).mockResolvedValue(mockDb);
  });

  it('should get user notifications', async () => {
    const mockNotifications = [
      { id: '1', userId: 'user-123', title: 'Test', message: 'Hello', isRead: false },
    ];
    mockDb.orderBy.mockResolvedValue(mockNotifications);

    const result = await service.getUserNotifications('user-123');
    expect(result).toEqual(mockNotifications);
  });
});
```

### Step 7: Run Tests

```bash
npm run test
```

### Step 8: Create Migration

```bash
npx drizzle-kit generate
npm run db:push
```

## Result

Now you have a fully functional notifications module at `/notifications` endpoint:

- `GET /notifications` - Get all notifications for current user
- `POST /notifications` - Create a new notification
- `PUT /notifications/:id/read` - Mark notification as read
