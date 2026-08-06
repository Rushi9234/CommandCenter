import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class FilePersistence {
  private saveTimeout: NodeJS.Timeout | null = null;

  // Save data to file (debounced to avoid too many writes)
  save(data: any) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      try {
        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync(DATA_FILE, jsonData, 'utf8');
        console.log('✅ Data saved to file');
      } catch (error) {
        console.error('❌ Failed to save data:', error);
      }
    }, 1000); // Save after 1 second of no changes
  }

  // Load data from file
  load(): any {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const jsonData = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(jsonData);
        console.log('✅ Data loaded from file');
        return data;
      }
    } catch (error) {
      console.error('❌ Failed to load data:', error);
    }
    return null;
  }

  // Create backup
  backup() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFile = path.join(DATA_DIR, `backup-${timestamp}.json`);
        fs.copyFileSync(DATA_FILE, backupFile);
        console.log(`✅ Backup created: ${backupFile}`);
        
        // Keep only last 10 backups
        this.cleanOldBackups();
      }
    } catch (error) {
      console.error('❌ Failed to create backup:', error);
    }
  }

  private cleanOldBackups() {
    try {
      const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.startsWith('backup-'))
        .sort()
        .reverse();
      
      // Delete backups older than the 10 most recent
      files.slice(10).forEach(file => {
        fs.unlinkSync(path.join(DATA_DIR, file));
      });
    } catch (error) {
      console.error('❌ Failed to clean old backups:', error);
    }
  }
}

export const persistence = new FilePersistence();
