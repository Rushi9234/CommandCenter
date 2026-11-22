import { adminAnalyticsService } from '../src/modules/admin/adminAnalytics.service';
import { adminAnalyticsRepository } from '../src/modules/admin/adminAnalytics.repository';

describe('Platform Analytics Module (Phase 4B)', () => {
  it('returns valid platform KPI counts and time series trends for admin user', async () => {
    const adminUserId = 'admin-user-123';
    const result = await adminAnalyticsService.getPlatformAnalytics(adminUserId, '30days', undefined, undefined, true);

    expect(result.kpis).toBeDefined();
    expect(result.kpis.total_users).toBeGreaterThanOrEqual(1);
    expect(result.kpis.total_classes).toBeGreaterThanOrEqual(0);
    expect(result.kpis.total_teams).toBeGreaterThanOrEqual(0);
    expect(result.kpis.total_projects).toBeGreaterThanOrEqual(0);
    expect(result.kpis.total_tasks).toBeGreaterThanOrEqual(0);

    expect(result.trends).toBeDefined();
    expect(Array.isArray(result.trends.teams_created)).toBe(true);
    expect(Array.isArray(result.trends.classes_created)).toBe(true);
    expect(Array.isArray(result.trends.projects_created)).toBe(true);
    expect(Array.isArray(result.trends.task_activity)).toBe(true);
    expect(Array.isArray(result.trends.user_registrations)).toBe(true);
    expect(Array.isArray(result.trends.support_tickets)).toBe(true);
  });

  it('rejects platform analytics request for non-admin user with ForbiddenError', async () => {
    const regularUserId = 'regular-user-456';
    await expect(
      adminAnalyticsService.getPlatformAnalytics(regularUserId, '30days', undefined, undefined, false)
    ).rejects.toThrow('Only system administrators can access platform analytics');
  });

  it('handles custom date range validation cleanly', async () => {
    const adminUserId = 'admin-user-123';
    await expect(
      adminAnalyticsService.getPlatformAnalytics(adminUserId, 'custom', undefined, undefined, true)
    ).rejects.toThrow('Start date and end date are required for custom period');

    await expect(
      adminAnalyticsService.getPlatformAnalytics(adminUserId, 'custom', '2026-10-10', '2026-10-01', true)
    ).rejects.toThrow('Start date cannot be after end date');
  });
});
