import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditReportModal from './AuditReportModal';
import * as api from '../services/api';

vi.mock('../services/api');

const MOCK_AUDIT_REPORT = {
  context: {
    team_id: 'parent-1',
    team_name: 'Computer Science 101',
    team_type: 'classroom',
    description: 'Fall 2026 CS101 Classroom Context',
    generated_at: '2026-11-21T15:00:00.000Z',
    generated_by: 'Prof. Alice (Coordinator)',
  },
  summary: {
    total_teams: 2,
    total_tasks: 6,
    completed_tasks: 3,
    completion_rate: 50,
    average_velocity: 1.5,
    healthy_teams_count: 1,
    at_risk_teams_count: 1,
    open_blockers: 1,
    resolved_blockers: 2,
    total_tasks_completed_this_week: 3,
  },
  teams: [
    {
      team_id: 'team-alpha',
      team_name: 'Alpha Core Platform',
      member_count: 2,
      submitted_today: true,
      open_blocker_count: 0,
      task_progress: { total: 4, completed: 3, percent: 75 },
      health: { status: 'HEALTHY', score: 95, risks: [] },
      velocity: { completed_this_week: 3, score: 75, label: 'HIGH' },
    },
    {
      team_id: 'team-beta',
      team_name: 'Beta UI/UX',
      member_count: 1,
      submitted_today: false,
      open_blocker_count: 1,
      task_progress: { total: 2, completed: 0, percent: 0 },
      health: { status: 'AT_RISK', score: 45, risks: ['1 blocker open'] },
      velocity: { completed_this_week: 0, score: 0, label: 'IDLE' },
    },
  ],
  blockers: [
    {
      blocker_id: 'b-1',
      team_id: 'team-beta',
      team_name: 'Beta UI/UX',
      description: 'API CORS header mismatch in staging',
      severity: 'critical',
      status: 'open',
      created_at: '2026-11-20T10:00:00.000Z',
      resolved_at: null,
    },
    {
      blocker_id: 'b-2',
      team_id: 'team-alpha',
      team_name: 'Alpha Core Platform',
      description: 'PostgreSQL connection timeout in Neon',
      severity: 'medium',
      status: 'resolved',
      created_at: '2026-11-19T14:00:00.000Z',
      resolved_at: '2026-11-19T16:00:00.000Z',
    },
  ],
  csv: 'Mock CSV Data',
};

describe('AuditReportModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <AuditReportModal
        isOpen={false}
        onClose={vi.fn()}
        teamId="parent-1"
        teamName="Computer Science 101"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state initially when opened', () => {
    vi.mocked(api.getAuditReport).mockReturnValue(new Promise(() => {}));

    render(
      <AuditReportModal
        isOpen={true}
        onClose={vi.fn()}
        teamId="parent-1"
        teamName="Computer Science 101"
      />
    );

    expect(screen.getByTestId('report-loading')).toBeDefined();
    expect(screen.getByText(/Compiling audit metrics/i)).toBeDefined();
  });

  it('renders report data with executive KPIs, teams table, and blockers log', async () => {
    vi.mocked(api.getAuditReport).mockResolvedValue({
      data: { data: MOCK_AUDIT_REPORT },
    } as any);

    render(
      <AuditReportModal
        isOpen={true}
        onClose={vi.fn()}
        teamId="parent-1"
        teamName="Computer Science 101"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('report-content')).toBeDefined();
    });

    // Check Context Header
    expect(screen.getAllByText('Computer Science 101')[0]).toBeDefined();
    expect(screen.getByText('Prof. Alice (Coordinator)')).toBeDefined();

    // Check KPIs
    expect(screen.getByText('50%')).toBeDefined();
    expect(screen.getByText(/1 Open/i)).toBeDefined();
    expect(screen.getByText(/2 successfully resolved/i)).toBeDefined();

    // Check Sub-Teams Table
    expect(screen.getAllByText('Alpha Core Platform')[0]).toBeDefined();
    expect(screen.getAllByText('Beta UI/UX')[0]).toBeDefined();
    expect(screen.getAllByText(/HEALTHY/i)[0]).toBeDefined();
    expect(screen.getAllByText(/AT_RISK/i)[0]).toBeDefined();

    // Check Blockers
    expect(screen.getByText('API CORS header mismatch in staging')).toBeDefined();
    expect(screen.getByText('PostgreSQL connection timeout in Neon')).toBeDefined();
  });

  it('triggers CSV download when Export CSV button is clicked', async () => {
    vi.mocked(api.getAuditReport).mockResolvedValue({
      data: { data: MOCK_AUDIT_REPORT },
    } as any);
    vi.mocked(api.downloadAuditReportCsv).mockResolvedValue(undefined as any);

    render(
      <AuditReportModal
        isOpen={true}
        onClose={vi.fn()}
        teamId="parent-1"
        teamName="Computer Science 101"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('download-csv-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('download-csv-btn'));
    expect(api.downloadAuditReportCsv).toHaveBeenCalledWith('parent-1', 'Computer Science 101');
  });

  it('triggers window.print when Print / PDF button is clicked', async () => {
    vi.mocked(api.getAuditReport).mockResolvedValue({
      data: { data: MOCK_AUDIT_REPORT },
    } as any);

    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <AuditReportModal
        isOpen={true}
        onClose={vi.fn()}
        teamId="parent-1"
        teamName="Computer Science 101"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('print-report-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('print-report-btn'));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
