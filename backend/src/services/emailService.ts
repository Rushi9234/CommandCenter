import crypto from 'crypto';

export const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

export const sendVerificationEmail = async (email: string, token: string, fullName: string) => {
  const verificationUrl = `http://localhost:3000/verify-email?token=${token}`;
  
  console.log('\n========================================');
  console.log('📧 EMAIL VERIFICATION');
  console.log('========================================');
  console.log(`To: ${email}`);
  console.log(`Name: ${fullName}`);
  console.log(`\nVerification Link:`);
  console.log(verificationUrl);
  console.log('\n⚠️  IMPORTANT: Click link above to verify your email');
  console.log('========================================\n');
  
  // TODO: Replace with actual email service (SendGrid, AWS SES, etc.)
  // For now, just log to console
  
  return true;
};

export const sendTeamInviteEmail = async (email: string, teamName: string, inviterName: string) => {
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? 'https://commandcenter-sand.vercel.app' 
    : 'http://localhost:3000';
  
  const inviteLink = `${baseUrl}/login?invite=${encodeURIComponent(email)}&team=${encodeURIComponent(teamName)}`;
  
  console.log('\n========================================');
  console.log('📧 TEAM INVITATION');
  console.log('========================================');
  console.log(`To: ${email}`);
  console.log(`Team: ${teamName}`);
  console.log(`Invited by: ${inviterName}`);
  console.log(`\n🔗 Invitation Link:`);
  console.log(inviteLink);
  console.log('\n📋 Instructions:');
  console.log('1. Click the link above');
  console.log('2. Login or create an account');
  console.log('3. Accept the team invitation');
  console.log('========================================\n');
  
  // TODO: Replace with actual email service (SendGrid, AWS SES, etc.)
  // For now, just log to console
  
  return true;
};
