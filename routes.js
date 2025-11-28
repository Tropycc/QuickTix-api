import express from 'express';
import sql from 'mssql';
import 'dotenv/config';

const router = express.Router();

const db_connection_string = process.env.DB_CONNECTION_STRING;

// GET: /api/listings
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
    `;

    res.json(result.recordset);
});


// GET: /api/listings/:id
router.get('/:id', async (req, res) => {
    const id = req.params.id;

    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid listing ID. It must be a number." });
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
        return res.status(404).json({ message: 'Listing not found.' });
    }

    res.json(result.recordset[0]);
});


// POST: /api/listings/purchases
router.post('/purchases', async (req, res) => {
    console.log("RAW BODY:", req.body);

    const { BuyerName, BuyerEmail, Quantity, ListingId } = req.body;

    try {
        await sql.connect(db_connection_string);

        // Get ticket price from Listing
        const listingResult = await sql.query`
            SELECT TicketPrice 
            FROM [dbo].[Listing]
            WHERE ListingId = ${ListingId}
        `;

        if (listingResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Listing not found.' });
        }

        const PricePerTicket = listingResult.recordset[0].TicketPrice;
        const TotalPrice = PricePerTicket * Quantity;

        // Insert purchase with server-calculated pricing and current datetime
        const result = await sql.query`
            INSERT INTO [dbo].[Purchase]
            (BuyerName, BuyerEmail, PurchaseDate, Quantity, PricePerTicket, TotalPrice, ListingId)
            VALUES
            (${BuyerName}, ${BuyerEmail}, GETDATE(), ${Quantity}, ${PricePerTicket}, ${TotalPrice}, ${ListingId})
        `;

        if (result.rowsAffected[0] === 0) {
            return res.status(500).json({ message: 'Failed to complete purchase.' });
        }

        res.status(201).json({ message: 'Purchase inserted into db.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error inserting purchase.' });
    }
});

export default router;