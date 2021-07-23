# -*- encoding: utf-8 -*-
##############################################################################
#    Copyright (c) 2012 - Present Acespritech Solutions Pvt. Ltd. All Rights Reserved
#    Author: <info@acespritech.com>
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    A copy of the GNU General Public License is available at:
#    <http://www.gnu.org/licenses/gpl.html>.
#
##############################################################################
{
    'name': 'Point of Sale Enhancement',
    'version': '1.0',
    'category': 'General',
    'description': """
This module is contains features:
- Assign serial number to the products from Point of Sale,
- Return products from POS,
- Gift Coupon Voucher,
- Loyalty Management
""",
    'author': "Acespritech Solutions Pvt. Ltd.",
    'website': "www.acespritech.com",
    'depends': ['web', 'point_of_sale', 'base', 'sale', 'purchase', 'account', 'product'],
    'data': [
        'views/pos_spantree_8.xml',
        'pos/pos_view.xml',
        'coupon/pos_coupon_view.xml',
        'coupon/pos_coupon_security.xml',
        'coupon/account_journal.xml',
        'partner/partner_view.xml',
        'account/account_invoice_view.xml',
        'product/product_data.xml'
    ],
    'demo': [],
    'test': [],
    'qweb': ['static/src/xml/pos.xml'],
    'installable': True,
    'auto_install': False,
}
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: