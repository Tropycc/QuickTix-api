import express from 'express';
import sql from 'mssql';
import 'dotenv/config';

const router = express.Router();

const db_connection_string = process.env.DB_CONNECTION_STRING;

// GET: /api/photos
router.get('/', async (req, res) => {    
    await sql.connect(db_connection_string);

    const result = await sql.query`
        SELECT 
            a.ListingID, a.Title, a.Description, a.ListingDate, a.Location, 
            a.PhotoFileName,
            c.OwnerID, c.Name as OwnerName, 
            b.CategoryId, b.Name as CategoryName
        FROM [dbo].[Listing] a
        INNER JOIN [dbo].[Category] b
            ON a.[CategoryId] = b.[CategoryId]
        INNER JOIN [dbo].[Owner] c
            ON a.[OwnerID] = c.[OwnerID]
        WHERE a.[ListingID] = 1
    `;

    res.json(result.recordset);
});


// GET: /api/photos/:id
router.get('/:id', async (req, res) => {
    const id = req.params.id;

    if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid listing ID. It must be a number." });
    }

    await sql.connect(db_connection_string);

    const result = await sql.query`
        SELECT 
            a.ListingID, a.Title, a.Description, a.ListingDate, a.Location, 
            b.CategoryId, b.Name as ListingTitle
        FROM [dbo].[Listing] a
        INNER JOIN [dbo].[Category] b
            ON a.[CategoryId] = b.[CategoryId]
        WHERE a.[ListingID] = ${id}
    `;

    if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Listing not found.' });
    }

    res.json(result.recordset);
});


// POST: /api/photos/purchases
router.post('/purchases', async (req, res) => {
    const purchases = req.body;

    // TODO: Validate input

    await sql.connect(db_connection_string);

    const result = await sql.query`
        INSERT INTO [dbo].[Purchases]
        (BuyerName, BuyerEmail, PurchaseDate, PurchaseId)
        VALUES
        (${purchases.BuyerName}, ${purchases.BuyerEmail}, ${purchases.PurchaseDate}, ${purchases.PurchaseId})
    `;

    if (result.rowsAffected[0] === 0) {
        return res.status(500).json({ error: 'Failed to complete purchase.' });
    }

    res.send('Purchase inserted into db.');
});

export default router;