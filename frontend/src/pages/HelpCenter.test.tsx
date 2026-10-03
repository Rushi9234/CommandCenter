import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HelpCenter from './HelpCenter';
import * as api from '../services/api';

vi.mock('../services/api');
const mockOnReopenGuide = vi.fn();

vi.mock('../hooks/useQuickOverview', () => ({
  useQuickOverview: () => ({
    onReopenGuide: mockOnReopenGuide,
  }),
}));

const mockDocs = [
  {
    id: 'task-submissions',
    slug: 'task-submissions',
    title: 'Task & Daily Work Submission Guide',
    category: 'Work & Tasks',
    content: '# Task & Daily Work Submission Guide\n\n## How to Submit Work for Review\n1. Open your assigned task card.',
    sourceFile: 'task-submissions.md',
    summary: 'How to submit work for review and log daily progress.',
  },
  {
    id: 'team-management',
    slug: 'team-management',
    title: 'Team & Classroom Management Guide',
    category: 'Teams & Roles',
    content: '# Team & Classroom Management Guide\n\n## Team Roles & Permissions\nOwner, Admin, Manager, Member, Viewer.',
    sourceFile: 'team-management.md',
    summary: 'Team roles, creation, and classroom sub-teams.',
  },
];

const renderComponent = () =>
  render(
    <MemoryRouter initialEntries={['/help-center']}>
      <HelpCenter />
    </MemoryRouter>
  );

describe('HelpCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getHelpDocs).mockResolvedValue({ data: { success: true, data: mockDocs } } as any);
  });

  it('renders header, quick launchers, and documentation articles', async () => {
    renderComponent();

    expect(screen.getByText('CommandCenter Help Center & How-to-Use')).toBeInTheDocument();
    expect(screen.getByText('Take Guided Feature Tour')).toBeInTheDocument();
    expect(screen.getByText('Ask AI Copilot')).toBeInTheDocument();
    expect(screen.getByText('SOS Blocker Help Hub')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Task & Daily Work Submission Guide')).toBeInTheDocument();
      expect(screen.getByText('Team & Classroom Management Guide')).toBeInTheDocument();
    });
  });

  it('triggers onReopenGuide when Start Interactive Tour is clicked', async () => {
    renderComponent();
    const tourBtn = screen.getByText('Start Interactive Tour');
    fireEvent.click(tourBtn);

    expect(mockOnReopenGuide).toHaveBeenCalledTimes(1);
  });

  it('dispatches commandcenter:open-ai-help custom event when AI Chat button is clicked', async () => {
    renderComponent();
    const eventSpy = vi.fn();
    window.addEventListener('commandcenter:open-ai-help', eventSpy);

    const aiBtn = screen.getByText('Open AI Help Chat');
    fireEvent.click(aiBtn);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener('commandcenter:open-ai-help', eventSpy);
  });

  it('filters articles based on search query', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Task & Daily Work Submission Guide')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search guides, workflows/i);
    fireEvent.change(searchInput, { target: { value: 'Classroom' } });

    expect(screen.queryByText('Task & Daily Work Submission Guide')).not.toBeInTheDocument();
    expect(screen.getAllByText((_content, element) => element?.textContent === 'Team & Classroom Management Guide').length).toBeGreaterThan(0);
  });

  it('opens article modal reader when Read Full Guide is clicked', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Task & Daily Work Submission Guide')).toBeInTheDocument();
    });

    const readBtns = screen.getAllByText('Read Full Guide');
    fireEvent.click(readBtns[0]);

    expect(await screen.findByText('Close Reader')).toBeInTheDocument();
    expect(screen.getByText('Source: task-submissions.md')).toBeInTheDocument();

    const closeBtn = screen.getByText('Close Reader');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Close Reader')).not.toBeInTheDocument();
    });
  });
});
