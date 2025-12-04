import express from 'express';
import sql from 'mssql';
import 'dotenv/config';

const router = express.Router();
const db_connection_string = process.env.DB_CONNECTION_STRING;

// Validation helper functions
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const isValidCreditCard = (cardNumber) => {
    // Remove spaces and check if it's 13-19 digits
    const cleaned = cardNumber.replace(/\s/g, '');
    return /^\d{13,19}$/.test(cleaned);
};

const isValidExpiration = (expDate) => {
    // Format: MMYY (4 digits)
    if (!/^\d{4}$/.test(expDate)) return false;
    
    const month = parseInt(expDate.substring(0, 2));
    const year = parseInt('20' + expDate.substring(2, 4));
    
    // Validate month range
    if (month < 1 || month > 12) return false;
    
    // Check if card is expired
    const now = new Date();
    const expiry = new Date(year, month - 1);
    return expiry >= now;
};

const isValidCVV = (cvv) => {
    return /^\d{3,4}$/.test(cvv);
};

// GET: /api/listings
router.get('/', async (req, res) => {
    try {
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
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error fetching listings.' });
    }
});

// GET: /api/listings/categories
router.get('/categories', async (req, res) => {
    try {
        await sql.connect(db_connection_string);
        const result = await sql.query`
            SELECT CategoryId, Name
            FROM [dbo].[Category]
            ORDER BY Name
        `;
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error fetching categories.' });
    }
});

// GET: /api/listings/:id
router.get('/:id', async (req, res) => {
    const id = req.params.id;
    
    // Validate ID is a number
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid listing ID. It must be a positive number." });
    }

    try {
        await sql.connect(db_connection_string);
        const result = await sql.query`
            SELECT 
                a.ListingID, a.Title, a.Description, a.ListingDate, a.Location, 
                a.PhotoFileName,
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
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error fetching listing.' });
    }
});

// POST: /api/listings/purchases
router.post('/purchases', async (req, res) => {
    console.log("RAW BODY:", req.body);
    
    const { 
        BuyerName, 
        BuyerEmail, 
        Quantity, 
        ListingId,
        CVV,
        CreditCardNumber,
        ExpirationDate
    } = req.body;

    // Validation
    const errors = [];

    // Validate BuyerName
    if (!BuyerName || BuyerName.trim().length === 0) {
        errors.push('Buyer name is required.');
    } else if (BuyerName.trim().length < 2) {
        errors.push('Buyer name must be at least 2 characters.');
    } else if (BuyerName.trim().length > 100) {
        errors.push('Buyer name must be less than 100 characters.');
    }

    // Validate BuyerEmail
    if (!BuyerEmail || BuyerEmail.trim().length === 0) {
        errors.push('Email is required.');
    } else if (!isValidEmail(BuyerEmail)) {
        errors.push('Invalid email format.');
    }

    // Validate Quantity
    if (!Quantity || isNaN(Quantity)) {
        errors.push('Quantity must be a number.');
    } else if (Quantity < 1) {
        errors.push('Quantity must be at least 1.');
    } else if (Quantity > 100) {
        errors.push('Quantity cannot exceed 100 tickets.');
    } else if (!Number.isInteger(Number(Quantity))) {
        errors.push('Quantity must be a whole number.');
    }

    // Validate ListingId
    if (!ListingId || isNaN(ListingId)) {
        errors.push('Listing ID must be a number.');
    } else if (ListingId <= 0) {
        errors.push('Invalid listing ID.');
    }

    // Validate Credit Card Number
    if (!CreditCardNumber || CreditCardNumber.trim().length === 0) {
        errors.push('Credit card number is required.');
    } else if (!isValidCreditCard(CreditCardNumber)) {
        errors.push('Invalid credit card number format.');
    }

    // Validate Expiration Date
    if (!ExpirationDate || ExpirationDate.trim().length === 0) {
        errors.push('Expiration date is required.');
    } else if (!isValidExpiration(ExpirationDate)) {
        errors.push('Invalid or expired expiration date.');
    }

    // Validate CVV
    if (!CVV || CVV.trim().length === 0) {
        errors.push('CVV is required.');
    } else if (!isValidCVV(CVV)) {
        errors.push('CVV must be 3 or 4 digits.');
    }

    // If there are validation errors, return them
    if (errors.length > 0) {
        return res.status(400).json({ 
            message: 'Validation failed.',
            errors: errors 
        });
    }

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

        // Sanitize inputs (trim strings)
        const sanitizedName = BuyerName.trim();
        const sanitizedEmail = BuyerEmail.trim();
        const sanitizedCard = CreditCardNumber.replace(/\s/g, '');
        const sanitizedExpiration = ExpirationDate.trim();
        const sanitizedCVV = CVV.trim();

        // Insert purchase with server-calculated pricing + credit card fields
        const result = await sql.query`
            INSERT INTO [dbo].[Purchase]
            (BuyerName, BuyerEmail, PurchaseDate, Quantity, PricePerTicket, TotalPrice, ListingId,
             CVV, CreditCardNumber, ExpirationDate)
            VALUES
            (${sanitizedName}, ${sanitizedEmail}, GETDATE(), ${Quantity}, ${PricePerTicket}, ${TotalPrice}, ${ListingId},
             ${sanitizedCVV}, ${sanitizedCard}, ${sanitizedExpiration})
        `;

        if (result.rowsAffected[0] === 0) {
            return res.status(500).json({ message: 'Failed to complete purchase.' });
        }

        res.status(201).json({ 
            message: 'Purchase completed successfully.',
            totalPrice: TotalPrice
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error inserting purchase.' });
    }
});

export default router;