import { getHelpDocsList, searchHelpCenterDocs } from '../src/modules/ai/rag/helpRagService';
import { helpController } from '../src/controllers/helpController';

describe('helpRagService & helpController', () => {
  it('loads and lists help documentation markdown files correctly', () => {
    const docs = getHelpDocsList();
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThanOrEqual(2);

    const taskDoc = docs.find((d) => d.slug === 'task-submissions');
    expect(taskDoc).toBeDefined();
    expect(taskDoc?.title).toContain('Task & Daily Work Submission Guide');
    expect(taskDoc?.category).toBe('Work & Tasks');

    const teamDoc = docs.find((d) => d.slug === 'team-management');
    expect(teamDoc).toBeDefined();
    expect(teamDoc?.title).toContain('Team & Classroom Management Guide');
    expect(teamDoc?.category).toBe('Teams & Roles');
  });

  it('searches help center documentation chunks by query', () => {
    const results = searchHelpCenterDocs('task review', 3);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBeDefined();
    expect(results[0].content).toBeDefined();
  });

  it('helpController.getHelpDocs responds with success and doc array', async () => {
    const req = {} as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    await helpController.getHelpDocs(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.any(Array),
      })
    );
  });

  it('helpController.getHelpDocBySlug responds with specific doc or 404', async () => {
    const reqFound = { params: { slug: 'team-management' } } as any;
    const resFound = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    await helpController.getHelpDocBySlug(reqFound, resFound, next);

    expect(resFound.status).toHaveBeenCalledWith(200);
    expect(resFound.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          slug: 'team-management',
        }),
      })
    );

    const reqNotFound = { params: { slug: 'non-existent-doc' } } as any;
    const resNotFound = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await helpController.getHelpDocBySlug(reqNotFound, resNotFound, next);

    expect(resNotFound.status).toHaveBeenCalledWith(404);
    expect(resNotFound.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Help article not found',
      })
    );
  });
});
