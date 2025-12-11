import supabase from './db.js';

async function resetRatings() {
    console.log('Resetting all player ratings to 1500...');

    // Update all users. We use a condition that is always true (id > 0 assuming serial id, or just checking not null)
    // Or we can just omit 'eq' to update all? Supabase might require a WHERE clause for updates to prevent accidents.
    // Let's check not-null.

    const { data, error } = await supabase
        .from('players')
        .update({ rating: 1500 })
        .neq('id', -1); // Assuming IDs are positive

    if (error) {
        console.error('Error resetting ratings:', error);
    } else {
        console.log('Successfully reset ratings.');
    }

    process.exit();
}

resetRatings();
